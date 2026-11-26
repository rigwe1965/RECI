'use client'

import { brand } from '@reci/utils'
import { DemandGauge } from '@reci/ui'

interface DemandRow {
  category_name: string
  demand_score: number
  signal_type: 'normal' | 'high' | 'peak'
  vehicles_remaining: number | null
  computed_at: string | null
}

interface DemandCardProps {
  rows: DemandRow[]
}

export default function DemandCard({ rows }: DemandCardProps) {
  const lastUpdate = rows[0]?.computed_at

  return (
    <div className="bg-white dark:bg-gray-900 border border-[#E5E7EB] dark:border-gray-700 rounded-xl shadow-xs p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text dark:text-gray-100">Fleet Demand Today</h2>
        <div className="flex gap-3 text-xs text-text-muted dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#407E3C]" />Normal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />High</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Peak</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted dark:text-gray-400 text-center py-4">
          No demand data yet — pricing cron hasn&apos;t run.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <DemandGauge
              key={row.category_name}
              label={row.category_name}
              remaining={row.vehicles_remaining}
              signal={row.signal_type}
              pct={Math.round(row.demand_score * 100)}
            />
          ))}
        </div>
      )}

      {lastUpdate && (
        <p className="text-xs text-[#9CA3AF] dark:text-gray-500 mt-4">
          Last computed: {new Date(lastUpdate).toLocaleString('en-DE', { timeZone: brand.timeZone })}
        </p>
      )}
    </div>
  )
}
