/**
 * Household load shapes (share of daily consumption per clock hour, IST).
 *
 * These are illustrative assumptions, not measured utility load research. They exist
 * so the simulator can split consumption into "used while the sun shines" and "used
 * after dark", which decides how much solar is self-consumed versus exported. Callers
 * with smart-meter or Meter Sakshi data should pass their own 24-value profile.
 */

export type LoadProfileId = 'evening_peak' | 'daytime_home' | 'flat';

export interface LoadProfile {
  readonly id: LoadProfileId;
  readonly label: string;
  readonly description: string;
  readonly shape: readonly number[];
}

function normalise(weights: readonly number[]): number[] {
  if (weights.length !== 24) throw new RangeError(`a load profile needs 24 hourly values (got ${weights.length})`);
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError('load profile values must be ≥ 0');
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new RangeError('load profile must not be all zeros');
  return weights.map((w) => w / total);
}

const EVENING_PEAK = [2.5, 2.2, 2, 2, 2, 2.4, 3.6, 4.6, 4.6, 3.8, 3.2, 3, 3.2, 3.2, 3, 3, 3.2, 4, 5.6, 6.6, 7, 6.6, 5.2, 3.6];
const DAYTIME_HOME = [3, 2.8, 2.6, 2.6, 2.6, 2.8, 3.4, 4, 4.4, 4.6, 4.8, 5, 5.2, 5.2, 5, 4.8, 4.6, 4.6, 5, 5.4, 5.4, 5, 4.2, 3.4];

export const LOAD_PROFILES: Readonly<Record<LoadProfileId, LoadProfile>> = {
  evening_peak: {
    id: 'evening_peak',
    label: 'Out during the day',
    description: 'Morning bump, quiet afternoon, strong 6–11 pm peak (lights, TV, cooking, night fans/AC).',
    shape: normalise(EVENING_PEAK),
  },
  daytime_home: {
    id: 'daytime_home',
    label: 'Someone home all day',
    description: 'Fans, fridge, pumps and some AC through the day, with a milder evening peak.',
    shape: normalise(DAYTIME_HOME),
  },
  flat: {
    id: 'flat',
    label: 'Flat',
    description: 'Equal use every hour. A neutral reference, not a realistic home.',
    shape: normalise(Array.from({ length: 24 }, () => 1)),
  },
};

export function resolveLoadProfile(profile: LoadProfileId | readonly number[] | undefined): readonly number[] {
  if (profile === undefined) return LOAD_PROFILES.evening_peak.shape;
  if (typeof profile === 'string') return LOAD_PROFILES[profile].shape;
  return normalise(profile);
}
