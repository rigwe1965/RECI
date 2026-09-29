import * as Sentry from '@sentry/nextjs'

export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
  })
}

// Without this, Server Component / Route Handler / middleware exceptions are
// never reported — only client-side render errors (caught by error.tsx /
// global-error.tsx) reach Sentry. See audits/error-handling-audit-2026-09-29.md #5.
export const onRequestError = Sentry.captureRequestError
