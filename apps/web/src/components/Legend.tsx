import type { Verification } from '@open-tariff-india/data';

const MARK_LABEL: Readonly<Record<Verification, string>> = {
  verified: 'Read in the tariff order or regulation',
  secondary: 'From a secondary source; awaiting a primary check',
  unverified: 'Placeholder: not yet confirmed',
};

export function VerificationMark({ level }: { level: Verification }) {
  return <span className={`mark ${level}`} title={MARK_LABEL[level]} aria-label={MARK_LABEL[level]} role="img" />;
}

/** Explains the verification marks wherever they appear. */
export function MarkLegend() {
  return (
    <p className="legend">
      <span>
        <VerificationMark level="verified" /> read in the tariff order
      </span>
      <span>
        <VerificationMark level="secondary" /> from a secondary source
      </span>
      <span>
        <VerificationMark level="unverified" /> not yet confirmed
      </span>
    </p>
  );
}
