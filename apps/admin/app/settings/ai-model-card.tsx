'use client'

import { useEffect, useState } from 'react'

type Choice = { id: string; label: string; note: string }
type State = { model: string | null; choices: Choice[]; ready: boolean }

/** Settings > AI model. Only admins can open it (the API refuses staff), so a staff member sees nothing. */
export default function AiModelCard() {
  const [state, setState] = useState<State | null>(null)
  const [hidden, setHidden] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/admin/api/admin/ai-model')
      .then(async (r) => (r.ok ? ((await r.json()) as State) : null))
      .then((s) => (s ? setState(s) : setHidden(true)))
      .catch(() => setHidden(true))
  }, [])

  async function choose(model: string | null) {
    if (!state || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const r = await fetch('/admin/api/admin/ai-model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Could not save')
      setState({ ...state, model })
      setMessage({ ok: true, text: 'Saved. The website uses it within a minute.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  if (hidden || !state) return null

  const options: Array<{ id: string | null; label: string; note: string }> = [
    { id: null, label: 'Built-in (recommended)', note: 'Each feature keeps the model it was tested with.' },
    ...state.choices,
  ]

  return (
    <div className="bg-white dark:bg-gray-900 border border-[#E5E7EB] dark:border-gray-700 rounded-xl p-6 shadow-sm mt-6">
      <h2 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100 mb-1">AI model</h2>
      <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-4">
        Which Claude model answers customer chat, search, trip planning, corporate requests and licence/damage photo checks. Larger models cost more.
        Suggestions on the extras page and maintenance notes always stay on a small, cheap model.
      </p>
      {!state.ready && (
        <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">This setting is not available yet (the database update has not been applied).</p>
      )}
      <fieldset disabled={saving || !state.ready} className="space-y-2">
        {options.map((o) => (
          <label key={o.id ?? 'builtin'} className="flex items-start gap-3 border border-[#E5E7EB] dark:border-gray-700 rounded-lg p-3 cursor-pointer has-[:checked]:border-[#407E3C]">
            <input type="radio" name="ai-model" className="mt-1" checked={state.model === o.id} onChange={() => choose(o.id)} />
            <span className="text-sm">
              <span className="font-medium text-[#1A1A1A] dark:text-gray-100">{o.label}</span>
              <span className="block text-[#6B7280] dark:text-gray-400">{o.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {message && (
        <p className={`mt-3 text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
    </div>
  )
}
