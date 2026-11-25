import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { BRAND_ASSETS, BRAND_IDENTITY } from '../../config/assets.ts';

interface CinematicIntroProps {
  onComplete: () => void;
}

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const [exiting, setExiting] = useState(false);
  const completedRef = useRef(false);
  const skipTimerRef = useRef<number | null>(null);

  const finishOnce = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    const finishTimer = window.setTimeout(() => {
      setExiting(true);
    }, 3000);

    const completeTimer = window.setTimeout(() => {
      finishOnce();
    }, 3450);

    return () => {
      window.clearTimeout(finishTimer);
      window.clearTimeout(completeTimer);
      if (skipTimerRef.current !== null) {
        window.clearTimeout(skipTimerRef.current);
      }
    };
  }, [onComplete]);

  const handleSkip = () => {
    if (completedRef.current || exiting) return;
    setExiting(true);
    skipTimerRef.current = window.setTimeout(finishOnce, 220);
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#0B2239] text-slate-100 overflow-hidden select-none"
      role="region"
      aria-label="Hema Nexus Clinical Startup"
    >
      {/* Subtle clinical grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-10 pt-[max(1.25rem,env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#08192B] p-1.5 border border-[#1E3F66] flex items-center justify-center shrink-0">
            <img
              src={BRAND_ASSETS.officialLogo}
              alt="Hema Nexus Official Emblem"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
              {BRAND_IDENTITY.name}
            </div>
            <div className="text-[11px] font-mono text-sky-300/80">
              Clinical Diagnostic Companion
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 rounded-lg transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <span>Skip</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Center Device Panel */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-4 max-w-4xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl"
        >
          <div className="rounded-xl border border-[#1E3F66] bg-[#081829] p-4 sm:p-6">
            <img
              src={BRAND_ASSETS.productPhoto}
              alt="Hema Nexus Multi-Parameter Diagnostic Device"
              referrerPolicy="no-referrer"
              className="w-full max-h-[40vh] object-contain mx-auto rounded-lg"
            />
          </div>
        </motion.div>

        <div className="mt-6 text-center max-w-lg">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
            {BRAND_IDENTITY.tagline}
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Multi-parameter blood analysis, physiological vital signs monitoring, and structured clinical records.
          </p>
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <div className="relative z-10 px-6 sm:px-10 pb-[max(2rem,env(safe-area-inset-bottom,0px))] max-w-md mx-auto w-full">
        <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
          <span>Initializing clinical workstation</span>
          <span className="tabular-nums-mono text-sky-300">Hema Nexus</span>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2.9, ease: 'linear' }}
            style={{ transformOrigin: 'left' }}
            className="h-full bg-sky-400"
          />
        </div>
      </div>
    </motion.div>
  );
}
