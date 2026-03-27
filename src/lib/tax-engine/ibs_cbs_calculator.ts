/**
 * IBS/CBS Tax Engine — TributoFlow
 * Calcula preço de venda com impostos embutidos usando a fórmula "por dentro"
 * conforme LC 214/2025 (Reforma Tributária brasileira).
 */

// === TYPES ===

export interface PriceCalculationParams {
  cost: number
  targetMarginPercent: number
  ibsAliquotPercent: number   // ex: 12.5
  cbsAliquotPercent: number   // ex: 8.8
  issAliquotPercent?: number  // para serviços (regime anterior)
  pRedIBS?: number            // redução base IBS (0-100)
  pRedCBS?: number            // redução base CBS (0-100)
  isMonofasic?: boolean
  scenarioLabel?: string
}

export interface PriceCalculationResult {
  scenarioLabel: string
  cost: number
  targetMarginPercent: number
  effectiveTaxLoadPercent: number
  netPrice: number
  grossPrice: number
  ibsAmount: number
  cbsAmount: number
  issAmount: number
  netMarginPercent: number
  breakdown: {
    ibsBase: number
    ibsRate: number
    ibsAmount: number
    cbsBase: number
    cbsRate: number
    cbsAmount: number
    issAmount: number
    totalTaxAmount: number
  }
}

export interface BeforeAfterParams {
  cost: number
  targetMarginPercent: number
  before_icmsAliquot: number
  before_pisAliquot: number
  before_cofinsAliquot: number
  after: PriceCalculationParams
}

export interface BeforeAfterResult {
  before: PriceCalculationResult
  after: PriceCalculationResult
  priceVariationPercent: number
  taxLoadVariationPercent: number
  marginVariationPercent: number
}

// === CORE FUNCTIONS ===

/**
 * Calculate price with IBS/CBS taxes embedded ("por dentro")
 *
 * Formula:
 *   effectiveIBS = ibsAliquot * (1 - pRedIBS/100)
 *   effectiveCBS = cbsAliquot * (1 - pRedCBS/100)
 *   effectiveTaxRate = (effectiveIBS + effectiveCBS) / 100
 *
 *   If monofasic: effectiveTaxRate = 0 (tax already paid upstream)
 *
 *   netPrice = cost / (1 - targetMargin/100)
 *   grossPrice = netPrice / (1 - effectiveTaxRate)
 *
 *   ibsAmount = grossPrice * effectiveIBS / 100
 *   cbsAmount = grossPrice * effectiveCBS / 100
 */
export function calculatePriceWithTax(params: PriceCalculationParams): PriceCalculationResult {
  const {
    cost,
    targetMarginPercent,
    ibsAliquotPercent,
    cbsAliquotPercent,
    issAliquotPercent = 0,
    pRedIBS = 0,
    pRedCBS = 0,
    isMonofasic = false,
    scenarioLabel = 'Cenário',
  } = params

  // Effective rates after reductions
  const effectiveIbsRate = isMonofasic ? 0 : ibsAliquotPercent * (1 - pRedIBS / 100)
  const effectiveCbsRate = isMonofasic ? 0 : cbsAliquotPercent * (1 - pRedCBS / 100)
  const effectiveTaxRate = (effectiveIbsRate + effectiveCbsRate) / 100

  // Margin as decimal
  const marginDecimal = targetMarginPercent / 100

  // Net price (cost + margin, before tax)
  const netPrice = cost / (1 - marginDecimal)

  // Gross price with taxes "por dentro"
  const denominator = 1 - effectiveTaxRate
  const grossPrice = denominator > 0 ? netPrice / denominator : netPrice

  // Tax amounts
  const ibsAmount = grossPrice * effectiveIbsRate / 100
  const cbsAmount = grossPrice * effectiveCbsRate / 100
  const issAmount = grossPrice * issAliquotPercent / 100
  const totalTaxAmount = ibsAmount + cbsAmount + issAmount

  // Effective tax load as % of gross price
  const effectiveTaxLoadPercent = grossPrice > 0 ? (totalTaxAmount / grossPrice) * 100 : 0

  // Net margin (after taxes)
  const netMarginPercent = grossPrice > 0 ? ((grossPrice - cost - totalTaxAmount) / grossPrice) * 100 : 0

  return {
    scenarioLabel,
    cost: round(cost),
    targetMarginPercent,
    effectiveTaxLoadPercent: round(effectiveTaxLoadPercent),
    netPrice: round(netPrice),
    grossPrice: round(grossPrice),
    ibsAmount: round(ibsAmount),
    cbsAmount: round(cbsAmount),
    issAmount: round(issAmount),
    netMarginPercent: round(netMarginPercent),
    breakdown: {
      ibsBase: round(grossPrice),
      ibsRate: round(effectiveIbsRate),
      ibsAmount: round(ibsAmount),
      cbsBase: round(grossPrice),
      cbsRate: round(effectiveCbsRate),
      cbsAmount: round(cbsAmount),
      issAmount: round(issAmount),
      totalTaxAmount: round(totalTaxAmount),
    },
  }
}

/**
 * Calculate price in the legacy regime (ICMS + PIS/COFINS)
 * Also "por dentro" for ICMS
 */
function calculateLegacyPrice(
  cost: number,
  targetMarginPercent: number,
  icmsAliquot: number,
  pisAliquot: number,
  cofinsAliquot: number,
): PriceCalculationResult {
  const marginDecimal = targetMarginPercent / 100
  const netPrice = cost / (1 - marginDecimal)

  // ICMS is "por dentro", PIS/COFINS are also embedded
  const totalLegacyRate = (icmsAliquot + pisAliquot + cofinsAliquot) / 100
  const denominator = 1 - totalLegacyRate
  const grossPrice = denominator > 0 ? netPrice / denominator : netPrice

  const icmsAmount = grossPrice * icmsAliquot / 100
  const pisAmount = grossPrice * pisAliquot / 100
  const cofinsAmount = grossPrice * cofinsAliquot / 100
  const totalTax = icmsAmount + pisAmount + cofinsAmount

  const effectiveTaxLoadPercent = grossPrice > 0 ? (totalTax / grossPrice) * 100 : 0
  const netMarginPercent = grossPrice > 0 ? ((grossPrice - cost - totalTax) / grossPrice) * 100 : 0

  return {
    scenarioLabel: 'Regime Atual (ICMS+PIS/COFINS)',
    cost: round(cost),
    targetMarginPercent,
    effectiveTaxLoadPercent: round(effectiveTaxLoadPercent),
    netPrice: round(netPrice),
    grossPrice: round(grossPrice),
    ibsAmount: round(icmsAmount),    // reuse field for ICMS
    cbsAmount: round(pisAmount + cofinsAmount), // reuse for PIS+COFINS
    issAmount: 0,
    netMarginPercent: round(netMarginPercent),
    breakdown: {
      ibsBase: round(grossPrice),
      ibsRate: round(icmsAliquot),
      ibsAmount: round(icmsAmount),
      cbsBase: round(grossPrice),
      cbsRate: round(pisAliquot + cofinsAliquot),
      cbsAmount: round(pisAmount + cofinsAmount),
      issAmount: 0,
      totalTaxAmount: round(totalTax),
    },
  }
}

/**
 * Compare price before (ICMS+PIS/COFINS) and after (IBS/CBS) reform
 */
export function compareBeforeAfterReform(params: BeforeAfterParams): BeforeAfterResult {
  const before = calculateLegacyPrice(
    params.cost,
    params.targetMarginPercent,
    params.before_icmsAliquot,
    params.before_pisAliquot,
    params.before_cofinsAliquot,
  )
  const after = calculatePriceWithTax(params.after)

  const priceVariation = before.grossPrice > 0
    ? ((after.grossPrice - before.grossPrice) / before.grossPrice) * 100 : 0
  const taxLoadVariation = before.effectiveTaxLoadPercent > 0
    ? (after.effectiveTaxLoadPercent - before.effectiveTaxLoadPercent) : 0
  const marginVariation = after.netMarginPercent - before.netMarginPercent

  return {
    before,
    after,
    priceVariationPercent: round(priceVariation),
    taxLoadVariationPercent: round(taxLoadVariation),
    marginVariationPercent: round(marginVariation),
  }
}

// === CONSTANTS ===

export const DEFAULT_RATES = {
  ibs_state: 12.5,     // IBS estadual %
  ibs_mun: 5.2,        // IBS municipal %
  cbs: 8.8,            // CBS federal %
  reduction_ibs: 0,    // fator de redução IBS (0-1)
  reduction_cbs: 0,    // fator de redução CBS (0-1)
}

// === HELPERS ===

/** Wrapper used by AdminPriceSimulation page */
export function simulatePrice(params: {
  cost: number
  target_margin: number
  rates: typeof DEFAULT_RATES
  legacy_tax_rate: number
}): {
  price_before: number
  price_after: number
  tax_load_before: number
  tax_load_after: number
  tax_rate_before_pct: number
  tax_rate_after_pct: number
  ibs_amount: number
  cbs_amount: number
  effective_margin: number
} {
  const { cost, target_margin, rates, legacy_tax_rate } = params
  const ibsTotal = rates.ibs_state + rates.ibs_mun
  const pRedIBS = rates.reduction_ibs * 100   // convert 0-1 to 0-100
  const pRedCBS = rates.reduction_cbs * 100

  const after = calculatePriceWithTax({
    cost,
    targetMarginPercent: target_margin * 100,
    ibsAliquotPercent: ibsTotal,
    cbsAliquotPercent: rates.cbs,
    pRedIBS,
    pRedCBS,
  })

  // Simple legacy calculation
  const marginDecimal = target_margin
  const netPrice = cost / (1 - marginDecimal)
  const priceBefore = legacy_tax_rate < 1 ? netPrice / (1 - legacy_tax_rate) : netPrice
  const taxBefore = priceBefore * legacy_tax_rate

  return {
    price_before: round(priceBefore),
    price_after: round(after.grossPrice),
    tax_load_before: round(taxBefore),
    tax_load_after: round(after.breakdown.totalTaxAmount),
    tax_rate_before_pct: round(legacy_tax_rate * 100),
    tax_rate_after_pct: round(after.effectiveTaxLoadPercent),
    ibs_amount: round(after.ibsAmount),
    cbs_amount: round(after.cbsAmount),
    effective_margin: round(after.netMarginPercent),
  }
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}
