const EUR_FORMATTER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/**
 * Locale-correct EUR formatting (de-DE: "1.234,50 €") — includes the € symbol.
 */
export function formatEUR(amount: number): string {
  return EUR_FORMATTER.format(amount)
}
