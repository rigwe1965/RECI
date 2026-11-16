'use client'

import { useEffect, useState } from 'react'

interface Status {
  enforced: boolean
  state: string
  banner: string | null
}

/**
 * Tells an admin about the licence, but only when one is being enforced and there is something to say. Nothing is shown
 * on a deployment that does not enforce a licence (every deployment until a copy is sold), and it never blocks anything.
 */
export default function LicenceBanner({ userRole }: { userRole: string }) {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    if (userRole !== 'admin') return
    let live = true
    fetch('/api/admin/licence/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => live && setStatus(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [userRole])

  if (userRole !== 'admin' || !status?.enforced || !status.banner) return null
  const urgent = status.state === 'unlicensed' || status.state === 'lapsed'
  return (
    <div
      role="status"
      className={`px-6 py-3 text-sm border-b ${urgent ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
    >
      {status.banner}
    </div>
  )
}
