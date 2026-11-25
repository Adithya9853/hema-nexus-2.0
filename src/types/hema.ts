export type NavSection =
  | 'home'
  | 'device'
  | 'simulator'
  | 'tests'
  | 'history'
  | 'trends'
  | 'reports'
  | 'profile'
  | 'settings'
  | 'admin';

export type AvailabilityStatus =
  | 'available'
  | 'device_required'
  | 'coming_soon'
  | 'unavailable';

export type ClinicalStatus =
  | 'normal'
  | 'borderline'
  | 'elevated'
  | 'low'
  | 'critical';

export type DataSourceType =
  | 'ble_device'
  | 'manual_entry'
  | 'simulated_device';

export type UserRole =
  | 'consumer'
  | 'hospital_operator'
  | 'clinician'
  | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'pending';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  unitSystem: 'conventional' | 'si';
  notificationsEnabled: boolean;
  deviceAlertsEnabled: boolean;
  autoSyncBle: boolean;
  shareQrIncludeEmergencyInfo: boolean;
}

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  patientCode: string;
  avatarUrl: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  hospitalId: number | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalRecord {
  id: number;
  hospitalCode: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationNumber: string | null;
  accountStatus: AccountStatus;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecord {
  id: number;
  ownerUid: string;
  hospitalId: number | null;
  uhid: string;
  fullName: string;
  dateOfBirth: string | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord {
  id: number;
  ownerUid: string;
  hospitalId: number | null;
  deviceName: string;
  deviceIdentifier: string;
  deviceModel: string;
  firmwareVersion: string | null;
  hardwareRevision: string | null;
  connectionType: string;
  status: 'connected' | 'disconnected' | 'paired';
  calibrationStatus: 'calibrated' | 'due' | 'overdue' | 'uncalibrated';
  sensorChannels: string[] | null;
  lastConnectedAt: string | null;
  lastCommunicationAt: string | null;
  createdAt: string;
}

export interface DeviceEventRecord {
  id: number;
  deviceId: number;
  userUid: string;
  eventType:
    | 'paired'
    | 'connected'
    | 'disconnected'
    | 'error'
    | 'calibration'
    | 'firmware_update';
  connectionMode: 'ble' | 'simulated';
  errorCode: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CalibrationRecord {
  id: number;
  calibrationCode: string;
  deviceId: number;
  hospitalId: number | null;
  sensorChannel: string;
  calibrationDate: string;
  calibrationParameters: Record<string, unknown>;
  calibrationStatus: 'passed' | 'pending' | 'failed' | 'expired';
  verifiedByUid: string | null;
  verifiedByName: string | null;
  nextDueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface TestSessionRecord {
  id: number;
  sessionCode: string;
  userUid: string;
  patientRecordId: number | null;
  deviceId: number | null;
  hospitalId: number | null;
  operatorName: string | null;
  testMode: 'simulated' | 'real' | 'manual';
  sessionStatus: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  completionStatus: 'complete' | 'partial' | 'incomplete';
  selectedParameters: string[];
  errorDetails: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ReferenceRangeConfig {
  minNormal: number;
  maxNormal: number;
  borderlineLow?: number;
  borderlineHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  secondaryMinNormal?: number;
  secondaryMaxNormal?: number;
  secondaryLabel?: string;
  notes?: string;
}

export interface TestTypeRecord {
  id: number;
  slug: string;
  testName: string;
  category: 'blood' | 'physiological';
  portNumber: number | null;
  unit: string;
  secondaryUnit: string | null;
  availabilityStatus: AvailabilityStatus;
  sensingMethod: string;
  description: string;
  instructions: string[];
  referenceRangeConfig: ReferenceRangeConfig;
  accentColor: string;
}

export interface MeasurementRecord {
  id: number;
  userUid: string;
  deviceId: number | null;
  patientRecordId: number | null;
  sessionId: number | null;
  hospitalId: number | null;
  testType: string;
  testName: string;
  measuredValue: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  status: ClinicalStatus;
  dataSource: DataSourceType;
  isSimulated: boolean;
  validationStatus: 'validated' | 'flagged' | 'pending_review';
  referenceRangeSnapshot: ReferenceRangeConfig | null;
  idempotencyKey: string | null;
  notes: string | null;
  rawPacketHex: string | null;
  createdAt: string;
}

export interface ReportRecord {
  id: number;
  userUid: string;
  patientRecordId: number | null;
  sessionId: number | null;
  hospitalId: number | null;
  reportCode: string;
  title: string;
  patientName: string;
  patientId: string;
  measurementIds: number[];
  includesSimulatedData: boolean;
  reportFileLocation: string | null;
  verificationStatus: 'verified' | 'simulated_only' | 'draft';
  generatedByUid: string | null;
  generatedByName: string | null;
  summaryNotes: string | null;
  deviceSnapshot: {
    deviceName: string;
    deviceIdentifier: string;
    firmwareVersion?: string | null;
    isSimulated?: boolean;
  } | null;
  generatedAt: string;
}

export interface NotificationRecord {
  id: number;
  userUid: string;
  title: string;
  message: string;
  category: 'measurement' | 'device' | 'report' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  userUid: string;
  actorRole: string;
  hospitalId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface QueuedMeasurementPayload {
  idempotencyKey: string;
  testType: string;
  measuredValue: number;
  secondaryValue: number | null;
  measuredAt: string;
  dataSource: DataSourceType;
  deviceId: number | null;
  patientRecordId?: number | null;
  sessionId?: number | null;
  notes: string | null;
  rawPacketHex: string | null;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}
