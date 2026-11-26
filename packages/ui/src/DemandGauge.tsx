const SIGNAL_COLOR = {
  normal: { label: 'text-[#407E3C]', bg: 'bg-[#407E3C]' },
  high: { label: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500' },
  peak: { label: 'text-red-600 dark:text-red-400', bg: 'bg-red-500' },
}

export interface DemandGaugeProps {
  label: string
  remaining?: number | null
  signal: 'normal' | 'high' | 'peak'
  pct: number
}

export function DemandGauge({ label, remaining, signal, pct }: DemandGaugeProps) {
  const colors = SIGNAL_COLOR[signal]
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-text dark:text-gray-100">{label}</span>
        <div className="flex items-center gap-2">
          {remaining != null && signal !== 'normal' && (
            <span className="text-xs text-text-muted dark:text-gray-400">{remaining} left</span>
          )}
          <span className={`text-xs font-semibold ${colors.label}`}>{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-[#E5E7EB] dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.bg} transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
