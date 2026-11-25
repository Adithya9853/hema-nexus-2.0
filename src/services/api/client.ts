export class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

type TokenGetter = () => Promise<string | null>;

let activeTokenGetter: TokenGetter | null = null;

export function registerTokenGetter(getter: TokenGetter) {
  activeTokenGetter = getter;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Check your connection and retry.', 408, true);
    }
    throw new ApiError(
      'Network connection interrupted. Please check connectivity.',
      0,
      true,
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    requiresAuth?: boolean;
    retrySafe?: boolean;
  } = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    requiresAuth = true,
    retrySafe = method === 'GET',
  } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    if (!activeTokenGetter) {
      throw new ApiError('Authentication provider not initialized.', 401, false);
    }
    const token = await activeTokenGetter();
    if (!token) {
      throw new ApiError('Your session has expired. Please sign in again.', 401, false);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const maxAttempts = retrySafe ? 3 : 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        const message =
          (payload && typeof payload.error === 'string' && payload.error) ||
          `Server returned status ${response.status}`;
        const retryable = response.status >= 500 || response.status === 429;
        throw new ApiError(message, response.status, retryable);
      }

      return payload as T;
    } catch (err) {
      lastErr = err;
      const shouldRetry =
        retrySafe &&
        attempt < maxAttempts - 1 &&
        err instanceof ApiError &&
        err.retryable;

      if (!shouldRetry) {
        throw err;
      }

      const backoffMs = 450 * Math.pow(2, attempt);
      await new Promise((resolve) => window.setTimeout(resolve, backoffMs));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new ApiError('Unexpected request failure.', 500, false);
}
