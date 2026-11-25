import { BRAND_ASSETS } from '../../config/assets.ts';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  tone?: 'light' | 'dark';
}

export function BrandLogo({
  size = 'md',
  showWordmark = true,
  tone = 'dark',
}: BrandLogoProps) {
  const boxSize =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const textSize =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      <div
        className={`${boxSize} rounded-lg bg-[#0B2239] p-1 border border-[#1E3F66] flex items-center justify-center shrink-0 overflow-hidden`}
      >
        <img
          src={BRAND_ASSETS.officialLogo}
          alt="Hema Nexus Official Logo"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      </div>
      {showWordmark && (
        <span
          className={`${textSize} font-display font-bold tracking-tight whitespace-nowrap ${
            tone === 'light'
              ? 'text-white'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          Hema Nexus
        </span>
      )}
    </div>
  );
}
