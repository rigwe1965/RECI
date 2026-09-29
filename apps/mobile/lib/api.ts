import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// API routes return JSON error bodies like {"error":"..."} or
// {"error":"...","details":{...}}. Parse that out instead of using the raw
// response body as the Error message — otherwise callers that display
// err.message directly (Alert.alert, setError) show raw JSON to the user.
// See audits/error-handling-audit-2026-09-29.md #9.
async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json: unknown = await res.json()
    if (json && typeof json === 'object') {
      const error = (json as { error?: unknown }).error
      if (typeof error === 'string') return error
      const formErrors = (error as { formErrors?: unknown } | undefined)?.formErrors
      if (Array.isArray(formErrors) && typeof formErrors[0] === 'string') return formErrors[0]
    }
    return `API error ${res.status}`
  } catch {
    return `API error ${res.status}`
  }
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | undefined>
): Promise<T> {
  const token = await getToken()
  const url = new URL(path, API_URL)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
  }
  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    throw new Error(await parseErrorBody(res))
  }
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await parseErrorBody(res))
  }
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await parseErrorBody(res))
  }
  return res.json() as Promise<T>
}
