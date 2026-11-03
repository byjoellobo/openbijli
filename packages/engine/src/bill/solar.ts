import type { RooftopSolar, SolarRegime } from '@openbijli/data';
import { TariffDataError } from './energy.js';
import type { SolarCycleInput, SolarCycleResult } from './types.js';

export function selectRegime(solar: RooftopSolar, regimeId?: string): SolarRegime {
  const regime = regimeId ? solar.regimes.find((r) => r.id === regimeId) : solar.regimes.find((r) => r.default);
  if (!regime) {
    throw new TariffDataError(
      regimeId ? `Unknown solar regime "${regimeId}". Available: ${solar.regimes.map((r) => r.id).join(', ')}` : 'Book has no default solar regime',
    );
  }
  return regime;
}

/** Regimes that allow a system of this size, default first. */
export function regimesForCapacity(solar: RooftopSolar, capacityKw: number): SolarRegime[] {
  return solar.regimes
    .filter((r) => (r.minKw === undefined || capacityKw > r.minKw - 1e-9) && (r.maxKw === undefined || capacityKw <= r.maxKw + 1e-9))
    .toSorted((a, b) => Number(b.default) - Number(a.default));
}

/**
 * Export rate for a system: the subsidised band when the system took the central
 * capital subsidy and the regime publishes such bands, otherwise the standard rate.
 */
export function exportRateFor(regime: SolarRegime, capacityKw?: number, centralSubsidy?: boolean): number | null {
  const bands = regime.exportRate.withCentralSubsidy;
  if (centralSubsidy && bands && capacityKw !== undefined) {
    const band = bands.find((b) => b.upToKw === null || capacityKw <= b.upToKw + 1e-9) ?? bands.at(-1);
    if (band) return band.value;
  }
  return regime.exportRate.value;
}

/**
 * Settle one billing cycle's solar flows.
 *
 * net_metering: exports and the bank offset imports kWh for kWh; leftover kWh are
 *   banked, and paid at the export rate (or lapse) when the cycle closes the settlement period.
 * net_billing: every imported kWh is billed; every exported kWh earns the export rate.
 * gross_metering: all consumption is billed (importedUnits must be total consumption)
 *   and all generation earns the export rate.
 */
export function settleSolarCycle(regime: SolarRegime, importedUnits: number, input: SolarCycleInput, monthsInCycle = 1): SolarCycleResult {
  const rate = exportRateFor(regime, input.capacityKw, input.centralSubsidy);
  const exported = Math.max(0, input.exportedUnits);
  const opening = Math.max(0, input.openingBankUnits ?? 0);
  const base = { regimeId: regime.id, type: regime.type, importedUnits, exportedUnits: exported, exportRate: rate } as const;

  if (regime.type === 'net_metering') {
    const available = exported + opening;
    const billedUnits = Math.max(0, importedUnits - available);
    let closing = Math.max(0, available - importedUnits);
    const settles = input.settle === true || regime.settlement.period === 'billing_cycle';
    let settledUnits = 0;
    let settlementPayout = 0;
    if (settles && closing > 0) {
      settledUnits = closing;
      settlementPayout = regime.settlement.surplus === 'paid_at_export_rate' ? closing * (rate ?? 0) : 0;
      closing = 0;
    }
    const bankingCharge = regime.settlement.bankingChargePercentPerMonth ?? 0;
    if (closing > 0 && bankingCharge > 0) closing *= (1 - bankingCharge / 100) ** monthsInCycle;
    return { ...base, openingBankUnits: opening, closingBankUnits: closing, billedUnits, exportCredit: 0, settledUnits, settlementPayout };
  }

  const creditedUnits = regime.type === 'gross_metering' ? Math.max(0, input.generatedUnits ?? exported) : exported;
  return {
    ...base,
    openingBankUnits: 0,
    closingBankUnits: 0,
    billedUnits: importedUnits,
    exportCredit: creditedUnits * (rate ?? 0),
    settledUnits: 0,
    settlementPayout: 0,
  };
}
