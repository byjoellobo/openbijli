import { utilities, utilitiesByState } from '../lib/catalog';

interface UtilitySelectProps {
  value: string;
  onChange: (utilityId: string) => void;
}

export function UtilitySelect({ value, onChange }: UtilitySelectProps) {
  const selected = utilities.find((u) => u.id === value);
  return (
    <label className="field">
      <span>Your electricity company</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {utilitiesByState.map(({ state, items }) => (
          <optgroup key={state} label={state}>
            {items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.shortName}, {u.state}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && (
        <small>
          {selected.name}. {selected.regulator} tariff for FY {selected.latestFinancialYear}.
        </small>
      )}
    </label>
  );
}
