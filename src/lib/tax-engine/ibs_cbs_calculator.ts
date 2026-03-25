/**
 * IBS/CBS Calculator — Reforma Tributária (LC 214/2025)
 * Alíquotas de referência para simulação (MVP)
 */

export interface TaxRates {
  ibs_state: number    // % IBS estadual
  ibs_municipal: number // % IBS municipal
  cbs: number          // % CBS federal
  reduction_ibs: number // % redução cClassTrib
  reduction_cbs: number // % redução cClassTrib
}

export interface PriceSimulationInput {
  cost: number
  target_margin: number  // decimal, ex: 0.3 = 30%
  rates: TaxRates
  // Regime anterior (ICMS + PIS/COFINS estimado)
  legacy_tax_rate: number // decimal, ex: 0.2765
}

export interface PriceSimulationResult {
  price_before: number
  price_after: number
  tax_load_before: number  // valor absoluto do imposto anterior
  tax_load_after: number   // valor absoluto do imposto novo
  tax_rate_before_pct: number
  tax_rate_after_pct: number
  effective_margin_before: number
  effective_margin_after: number
}

export const DEFAULT_RATES: TaxRates = {
  ibs_state: 0.177,
  ibs_municipal: 0.023,
  cbs: 0.088,
  reduction_ibs: 0,
  reduction_cbs: 0,
}

/**
 * Calcula preço "por dentro" para o regime IBS/CBS
 * Fórmula: P = Custo / (1 - margem - aliquota_efetiva)
 */
export function simulatePrice(input: PriceSimulationInput): PriceSimulationResult {
  const { cost, target_margin, rates, legacy_tax_rate } = input

  const ibs_eff = rates.ibs_state * (1 - rates.reduction_ibs) + rates.ibs_municipal * (1 - rates.reduction_ibs)
  const cbs_eff = rates.cbs * (1 - rates.reduction_cbs)
  const total_new_rate = ibs_eff + cbs_eff

  // Preço regime anterior (cálculo simplificado "por fora")
  const price_before = cost / (1 - target_margin) * (1 + legacy_tax_rate)

  // Preço regime novo (por dentro — IBS/CBS incide sobre o próprio preço)
  const denominator = 1 - target_margin - total_new_rate
  const price_after = denominator > 0 ? cost / denominator : 0

  const tax_load_before = price_before * legacy_tax_rate
  const tax_load_after = price_after * total_new_rate

  const effective_margin_before = (price_before - cost - tax_load_before) / price_before
  const effective_margin_after = (price_after - cost - tax_load_after) / price_after

  return {
    price_before,
    price_after,
    tax_load_before,
    tax_load_after,
    tax_rate_before_pct: legacy_tax_rate * 100,
    tax_rate_after_pct: total_new_rate * 100,
    effective_margin_before,
    effective_margin_after,
  }
}
