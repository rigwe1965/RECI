'use client'

import { brand } from '@reci/utils'
import { useEffect, useState } from 'react'
import { DemandGauge } from '@reci/ui'

interface DemandRow {
  category_id: string
  demand_score: number
  signal_type: 'normal' | 'high' | 'peak'
  vehicles_remaining: number | null
  computed_at: string
  vehicle_categories: { name: string } | Array<{ name: string }> | null
}

function getCategoryName(raw: DemandRow['vehicle_categories']): string {
  if (!raw) return 'Unknown'
  return Array.isArray(raw) ? (raw[0]?.name ?? 'Unknown') : raw.name
}

export default function DemandCard() {
  const [rows, setRows] = useState<DemandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/demand-overview')
      .then((r) => r.json())
      .then((data: DemandRow[]) => {
        if (Array.isArray(data)) {
          setRows(data)
          if (data[0]?.computed_at) setLastUpdate(data[0].computed_at)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text dark:text-gray-100">Fleet Demand Today</h3>
        <div className="flex gap-3 text-xs text-text-muted dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#407E3C]" />Normal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />High</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-error" />Peak</span>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">
          No demand data yet — run pricing cron first.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => (
            <DemandGauge
              key={row.category_id}
              label={getCategoryName(row.vehicle_categories)}
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
