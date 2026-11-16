# RECI Transport — Claude Code Working Guide

AI-native car rental portal for Berlin. Turborepo + pnpm 9.15 monorepo, two Next.js 15 apps (App Router, TypeScript, Tailwind), Supabase (Postgres + RLS + Auth), Stripe, Resend, Anthropic API, Zustand, Zod.

| App | Port | URL |
|---|---|---|
| Customer web | **3002** | `http://localhost:3002` |
| Admin portal | 3001 | `http://localhost:3001/admin` (`basePath: '/admin'` — root on 3001 is always 404, expected) |

> **Port 3000 belongs to an unrelated RMM System process (PID 11724). Never kill it.** Web runs on 3002 and `NEXT_PUBLIC_APP_URL` in `apps/web/.env.local` must stay `http://localhost:3002`. After ANY `.env.local` change, kill + restart the dev server.

## Commands

```powershell
pnpm install                                # from root
pnpm exec turbo run dev --parallel          # web :3002 + admin :3001
cd apps/web ; pnpm exec tsc --noEmit        # type-check
pnpm turbo test                             # unit tests
pnpm test:e2e                               # Playwright (needs dev server on 3002)
netstat -ano | findstr :3002                # find PID, then: taskkill /F /PID <PID>  (never 11724)
```

CI (`.github/workflows/ci.yml`): quality → build on every push/PR; e2e on PRs to main only. Secrets: `SENTRY_AUTH_TOKEN`, plus Supabase/Stripe/Resend/Anthropic for e2e. Load tests: see `load-tests/README.md` (booking test = staging only, creates real rows).

## Key Rules

**Brand.** The company name, city, time zone and contact addresses come from `brand` (`packages/utils/src/brand.ts`, set by `NEXT_PUBLIC_BRAND_*`), never typed into a page, e-mail or AI prompt. Unset, it is RECI Transport / Berlin. `apps/web/__tests__/brand-guard.test.ts` fails if `RECI` or an unlisted `Berlin` is typed back in.

**Anthropic singleton.** Never `new Anthropic()` in a handler — `import anthropic from '@/lib/anthropic'`.

**next/image.** External hostnames must be in `next.config.mjs` `images.remotePatterns` (currently `**.supabase.co`, `images.unsplash.com`); a missing one crashes to the root error boundary. Use `unoptimized` on external images (optimizer proxy triggers rate limits). Vehicle images are Unsplash — Wikimedia blocks Vercel referers.

**Admin auth.** Role lives in `user_profiles.role` (checked server-side via the service-role client) and is mirrored to `app_metadata.role` on user create/update. Every admin API route is wrapped in `withAdminAuth` (`apps/admin/lib/with-admin-auth.ts`; `{ adminOnly: true }` for admin-only). "Users" nav only shows for `admin`; `staff` gets everything else.

**Admin shell.** All authenticated admin pages go through `AdminShell` — never add `AdminNav`/`TopBar` directly to a layout.

**Admin basePath.** Never `new URL('/auth/login', request.url)` in `apps/admin/middleware.ts` (drops basePath → 404 loop). Use `const u = request.nextUrl.clone(); u.pathname = '/auth/login'; return NextResponse.redirect(u)`. Admin links and fetches use relative paths (`/dashboard`, `fetch('/api/admin/users')`).

**Database security (RLS).** All writes go through the service-role client (`createAdminClient()`) or a route that whitelists columns. Never add client-facing INSERT/UPDATE/`FOR ALL` RLS policies on `bookings`, `user_profiles`, `licence_verifications`, `ai_conversations` or other tables the app writes — PostgREST would let any logged-in user bypass the API routes. `SECURITY DEFINER` functions must `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` and set `search_path`. Prices are always computed server-side (`calculatePrice`), never taken from the client.

**Other security rules.** HTML-escape every user/DB string put in emails (`escapeHtml` in `lib/email.ts`). Validate post-login redirects with `safeNextPath`. Rate-limit with `checkDbRateLimit()` (DB-backed), never an in-memory Map. Await anything that must happen before responding — serverless freezes un-awaited work.

**Supabase free tier.** Projects pause when idle; fetches fail with `TypeError: fetch failed`. Resume in the dashboard, then expect ~2 min of Cloudflare 521s.

## Bookings

Vehicle detail → `/book/[vehicleId]` → `/book/extras` → `/book/driver` → `/book/payment` → `/book/confirmation`. The booking row is created at the driver step; the Stripe webhook (`payment_intent.succeeded`) confirms it and awards loyalty points.

## AI

| Feature | Route | Model |
|---|---|---|
| Conversational search | `POST /api/ai/search` | claude-sonnet-4-6 |
| Extras recommendations | `POST /api/ai/extras-recommend` | claude-haiku-4-5-20251001 |
| Trip co-pilot | `POST /api/ai/trip` | claude-sonnet-4-6 |
| Licence OCR / Damage detection | `POST /api/ai/licence`, `/api/ai/damage` | via vision adapter |
| Corporate policy agent | `lib/corporate-agent.ts` | claude-sonnet-4-6 |
| Maintenance notes | admin `maintenance` route | claude-haiku-4-5-20251001 |

All AI calls are server-side and must fail gracefully — never block a page on AI.

**Vision adapter** (`apps/web/lib/ai-vision-adapter.ts`): `AI_VISION_PROVIDER=anthropic` (default) or `openai-compatible` (needs `AI_VISION_BASE_URL`, `AI_VISION_MODEL`, `AI_VISION_API_KEY`).

**HITL.** AI never auto-commits. Damage results store `ai_damage_report.pending_review = true` with no auto-dispute; licence results store `status = 'pending'` and do not touch `user_profiles.licence_verified`. Staff resolve them in `apps/admin/app/reviews/page.tsx` via `app/api/admin/reviews/{licences,damage}`.

## Common Issues

| Symptom | Fix |
|---|---|
| "Something went wrong" boundary | Image hostname missing from `remotePatterns` |
| Admin 401 / Users tab missing | `user_profiles.role` and `app_metadata.role` must both be set; user re-logs in |
| Admin 404 / redirect loop on `/auth/login` | basePath-losing redirect — see Admin basePath |
| Web calls wrong port / `/api/vehicles` "Resource not found" | `NEXT_PUBLIC_APP_URL` points at 3000 |
| Port in use | netstat + taskkill (never PID 11724) |
| `/api/locations` breaks `next build` | Keep `dynamic = 'force-dynamic'` + `Cache-Control: s-maxage=86400`; ISR made the build hit real Supabase |
| Vercel 500 "ByteString … 65279" | PowerShell BOM in env var — see Deployment |

## Deployment

Two Vercel projects (web, admin); full checklist in `SKILL.md` §18. Web needs `ADMIN_URL` set to the admin Vercel URL; Stripe webhook must target the production domain; `RESEND_FROM_EMAIL` must be a Resend-verified domain (`recitransport.de`; transactional from `bookings@`); Supabase Auth redirect URLs must include the production domain.

| App | URL |
|---|---|
| Customer portal | `https://web-lilac-nine-19.vercel.app` |
| Admin portal | `https://admin-umber-seven.vercel.app/admin` |
| Supabase project | `https://ewrknfmpdifdgxlmqbzi.supabase.co` |

Demo admin credentials were removed after a security review — do not reintroduce them (see `audits/`).

**Never set Vercel env vars by piping in PowerShell** — it prepends a UTF-16 BOM (U+FEFF) that breaks every Supabase/Anthropic call. Use Bash: `echo -n "value" | vercel env add VAR production`.

Full rebuild spec: `SKILL.md`. System docs: `docs/RECI_TRANSPORT_DOCS.md`.
