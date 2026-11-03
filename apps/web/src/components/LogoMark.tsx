interface LogoMarkProps {
  size?: number;
}

/**
 * The OpenBijli mark: a meter face with its register window and the red pulse LED that
 * Meter Sakshi reads. Same drawing as public/favicon.svg and docs/images/logo.svg.
 */
export function LogoMark({ size = 32 }: LogoMarkProps) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#1e2b4a" />
      <rect x="11" y="12" width="42" height="20" rx="4" fill="#f3f6f1" />
      <rect x="16.5" y="17" width="5.5" height="10" rx="1.5" fill="#1e2b4a" />
      <rect x="25" y="17" width="5.5" height="10" rx="1.5" fill="#1e2b4a" />
      <rect x="33.5" y="17" width="5.5" height="10" rx="1.5" fill="#1e2b4a" />
      <rect x="42" y="17" width="5.5" height="10" rx="1.5" fill="#4f3cb8" />
      <rect x="12" y="41" width="19" height="4" rx="2" fill="#8e9ab5" />
      <rect x="12" y="48.5" width="12" height="4" rx="2" fill="#8e9ab5" />
      <circle className="logo-led-glow" cx="44" cy="46" r="9.5" fill="#d9302b" fillOpacity="0.28" />
      <circle cx="44" cy="46" r="5.5" fill="#d9302b" />
    </svg>
  );
}
