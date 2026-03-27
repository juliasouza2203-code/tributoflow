/**
 * Tax Engine v2 — IBS/CBS Calculator
 * Implements the transition schedule from LC 214/2025.
 *
 * Reference rates (initial, will be updated by law):
 *   IBS (estados+municípios): 17.7%   (placeholder — final TBD)
 *   CBS (federal):             8.8%   (placeholder — final TBD)
 *   Total IVA dual:           26.5%
 *
 * Transition schedule 2026-2033:
 *   2026: 0.1% CBS test (IBS = 0)
 *   2027: 0.1% CBS test (IBS = 0)
 *   2028: 0.1% CBS test + IBS teste estadual
 *   2029: 7.95% CBS + 1.35% IBS (PIS/COFINS extinto)
 *   2030: 7.95% CBS + 4.05% IBS
 *   2031: 7.95% CBS + 6.75% IBS
 *   2032: 7.95% CBS + 9.45% IBS (ICMS/ISS reduzidos)
 *   2033: 8.8% CBS + 17.7% IBS (plena vigência)
 */

// ── Reference Rates ──────────────────────────────────────────────
export const REF_RATES = {
  CBS_FULL: 0.088,    // 8.8%
  IBS_FULL: 0.177,    // 17.7%
  IVA_FULL: 0.265,    // 26.5%
} as const

// ── Transition Schedule ──────────────────────────────────────────
export interface TransitionYear {
  year: number
  cbs: number  // CBS rate
  ibs: number  // IBS rate
  iva: number  // Total IVA dual
  label: string
}

export const TRANSITION_SCHEDULE: TransitionYear[] = [
  { year: 2026, cbs: 0.001, ibs: 0.000, iva: 0.001, label: 'Teste CBS 0.1%' },
  { year: 2027, cbs: 0.001, ibs: 0.000, iva: 0.001, label: 'Teste CBS 0.1%' },
  { year: 2028, cbs: 0.001, ibs: 0.001, iva: 0.002, label: 'Teste CBS+IBS' },
  { year: 2029, cbs: 0.0795, ibs: 0.0135, iva: 0.093, label: 'PIS/COFINS extinto' },
  { year: 2030, cbs: 0.0795, ibs: 0.0405, iva: 0.120, label: 'Transição' },
  { year: 2031, cbs: 0.0795, ibs: 0.0675, iva: 0.147, label: 'Transição' },
  { year: 2032, cbs: 0.0795, ibs: 0.0945, iva: 0.174, label: 'ICMS/ISS reduzidos' },
  { year: 2033, cbs: 0.088, ibs: 0.177, iva: 0.265, label: 'Plena vigência' },
]

export function getTransitionRates(year: number): TransitionYear {
  if (year < 2026) return { year, cbs: 0, ibs: 0, iva: 0, label: 'Pré-reforma' }
  if (year > 2033) return TRANSITION_SCHEDULE[TRANSITION_SCHEDULE.length - 1]
  return TRANSITION_SCHEDULE.find(t => t.year === year)!
}

// ── CST Reduction Factors ────────────────────────────────────────
export interface CstReductionFactors {
  pRedIBS: number  // percentage reduction on IBS (0–100)
  pRedCBS: number  // percentage reduction on CBS (0–100)
}

// ── Tax Calculation Input ────────────────────────────────────────
export interface TaxCalcInput {
  /** Base price (net of tax) or gross price */
  price: number
  /** Whether price is gross (tax-inclusive) */
  priceIsGross?: boolean
  /** Year for transition schedule */
  year: number
  /** CST reduction factors (from cClassTrib) */
  reductions?: CstReductionFactors
  /** Optional: specific CBS/IBS rates to override schedule */
  overrideCbs?: number
  overrideIbs?: number
}

// ── Tax Calculation Result ───────────────────────────────────────
export interface TaxCalcResult {
  /** Net price (base de cálculo) */
  netPrice: number
  /** Gross price (tax-inclusive) */
  grossPrice: number

  /** CBS rate after reductions */
  cbsEffective: number
  /** IBS rate after reductions */
  ibsEffective: number
  /** Total IVA rate after reductions */
  ivaEffective: number

  /** CBS amount */
  cbsAmount: number
  /** IBS amount */
  ibsAmount: number
  /** Total tax amount */
  totalTax: number

  /** Effective tax burden (tax / gross) */
  effectiveBurden: number

  /** Transition year info */
  transition: TransitionYear
}

/**
 * Calculate IBS/CBS taxes for a given price, year, and classification.
 *
 * IBS/CBS is calculated "por dentro" (tax-inclusive) like ICMS:
 *   grossPrice = netPrice / (1 - ivaRate)
 *   taxAmount = grossPrice * ivaRate
 *
 * When reductions apply:
 *   cbsEffective = cbsBase * (1 - pRedCBS/100)
 *   ibsEffective = ibsBase * (1 - pRedIBS/100)
 */
export function calculateTax(input: TaxCalcInput): TaxCalcResult {
  const transition = getTransitionRates(input.year)

  const cbsBase = input.overrideCbs ?? transition.cbs
  const ibsBase = input.overrideIbs ?? transition.ibs

  // Apply reductions
  const pRedCBS = input.reductions?.pRedCBS ?? 0
  const pRedIBS = input.reductions?.pRedIBS ?? 0
  const cbsEffective = cbsBase * (1 - pRedCBS / 100)
  const ibsEffective = ibsBase * (1 - pRedIBS / 100)
  const ivaEffective = cbsEffective + ibsEffective

  let netPrice: number
  let grossPrice: number

  if (input.priceIsGross) {
    grossPrice = input.price
    // "por dentro": net = gross * (1 - rate)
    netPrice = grossPrice * (1 - ivaEffective)
  } else {
    netPrice = input.price
    // gross = net / (1 - rate)
    grossPrice = ivaEffective < 1 ? netPrice / (1 - ivaEffective) : netPrice * 2
  }

  const cbsAmount = grossPrice * cbsEffective
  const ibsAmount = grossPrice * ibsEffective
  const totalTax = cbsAmount + ibsAmount
  const effectiveBurden = grossPrice > 0 ? totalTax / grossPrice : 0

  return {
    netPrice: round(netPrice),
    grossPrice: round(grossPrice),
    cbsEffective: roundRate(cbsEffective),
    ibsEffective: roundRate(ibsEffective),
    ivaEffective: roundRate(ivaEffective),
    cbsAmount: round(cbsAmount),
    ibsAmount: round(ibsAmount),
    totalTax: round(totalTax),
    effectiveBurden: roundRate(effectiveBurden),
    transition,
  }
}

// ── Batch Calculator ─────────────────────────────────────────────
export interface BatchItem {
  id: string
  description: string
  price: number
  priceIsGross?: boolean
  reductions?: CstReductionFactors
}

export interface BatchResult {
  items: Array<BatchItem & { result: TaxCalcResult }>
  totals: {
    netTotal: number
    grossTotal: number
    cbsTotal: number
    ibsTotal: number
    taxTotal: number
    avgBurden: number
  }
}

/**
 * Calculate taxes for a batch of items for a given year.
 */
export function calculateBatch(items: BatchItem[], year: number): BatchResult {
  const results = items.map(item => ({
    ...item,
    result: calculateTax({ price: item.price, priceIsGross: item.priceIsGross, year, reductions: item.reductions }),
  }))

  const netTotal = results.reduce((s, r) => s + r.result.netPrice, 0)
  const grossTotal = results.reduce((s, r) => s + r.result.grossPrice, 0)
  const cbsTotal = results.reduce((s, r) => s + r.result.cbsAmount, 0)
  const ibsTotal = results.reduce((s, r) => s + r.result.ibsAmount, 0)
  const taxTotal = results.reduce((s, r) => s + r.result.totalTax, 0)
  const avgBurden = grossTotal > 0 ? taxTotal / grossTotal : 0

  return {
    items: results,
    totals: {
      netTotal: round(netTotal),
      grossTotal: round(grossTotal),
      cbsTotal: round(cbsTotal),
      ibsTotal: round(ibsTotal),
      taxTotal: round(taxTotal),
      avgBurden: roundRate(avgBurden),
    },
  }
}

// ── Comparison: Current vs New System ────────────────────────────
export interface ComparisonInput {
  description: string
  price: number
  currentTaxRate: number  // current effective rate (PIS/COFINS/ICMS/ISS combined)
  reductions?: CstReductionFactors
}

export interface ComparisonResult {
  description: string
  price: number
  currentTax: number
  currentRate: number
  newTax: number
  newRate: number
  difference: number
  differencePercent: number
  impact: 'increase' | 'decrease' | 'neutral'
}

export function compareCurrentVsNew(
  items: ComparisonInput[],
  year: number = 2033,
): ComparisonResult[] {
  return items.map(item => {
    const currentTax = round(item.price * item.currentTaxRate)
    const calc = calculateTax({
      price: item.price,
      priceIsGross: false,
      year,
      reductions: item.reductions,
    })

    const difference = round(calc.totalTax - currentTax)
    const differencePercent = currentTax > 0
      ? round((difference / currentTax) * 100)
      : 0

    return {
      description: item.description,
      price: item.price,
      currentTax,
      currentRate: roundRate(item.currentTaxRate),
      newTax: calc.totalTax,
      newRate: calc.ivaEffective,
      difference,
      differencePercent,
      impact: difference > 0.01 ? 'increase' : difference < -0.01 ? 'decrease' : 'neutral',
    }
  })
}

// ── Formatting Helpers ───────────────────────────────────────────
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

// ── Math Helpers ─────────────────────────────────────────────────
function round(n: number): number {
  return Math.round(n * 100) / 100
}

function roundRate(n: number): number {
  return Math.round(n * 10000) / 10000
}
