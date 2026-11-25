import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';

interface HemaCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'clinical' | 'simulation';
  className?: string;
}

export function HemaCard({
  children,
  variant = 'default',
  className = '',
}: HemaCardProps) {
  const base =
    variant === 'clinical'
      ? 'hn-clinical-panel shadow-sm'
      : variant === 'simulation'
        ? 'bg-amber-50/90 dark:bg-[#1C1608] border border-amber-300 dark:border-amber-500/35 text-slate-900 dark:text-amber-50'
        : variant === 'elevated'
          ? 'bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] shadow-xs'
          : 'bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42]';

  return (
    <div className={`rounded-xl transition-colors ${base} ${className}`}>
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface StatusBannerProps {
  variant: 'error' | 'success' | 'warning' | 'info';
  message: string;
  onDismiss?: () => void;
  action?: React.ReactNode;
}

export function StatusBanner({
  variant,
  message,
  onDismiss,
  action,
}: StatusBannerProps) {
  const styles = {
    error:
      'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/35 text-rose-900 dark:text-rose-200',
    success:
      'border-teal-300 dark:border-teal-500/40 bg-teal-50 dark:bg-teal-950/35 text-teal-900 dark:text-teal-200',
    warning:
      'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
    info:
      'border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-950/35 text-sky-950 dark:text-sky-100',
  }[variant];

  const Icon =
    variant === 'error'
      ? AlertCircle
      : variant === 'success'
        ? CheckCircle2
        : variant === 'warning'
          ? AlertTriangle
          : Info;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`px-4 py-3 rounded-xl border text-xs sm:text-sm flex items-start justify-between gap-3 ${styles}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="leading-relaxed">{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-xl bg-slate-200/70 dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] hn-skeleton ${className}`}
    />
  );
}

interface BottomSheetModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export function BottomSheetModal({
  open,
  onClose,
  ariaLabel,
  maxWidthClass = 'max-w-lg',
  children,
}: BottomSheetModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <motion.div
            initial={{ y: 32, opacity: 0, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-white dark:bg-[#111B27] border-t sm:border border-[#D5E0EC] dark:border-[#1E2E42] pb-safe shadow-2xl`}
          >
            <div className="sm:hidden pt-2.5 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
