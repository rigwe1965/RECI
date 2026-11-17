# RECI Transport

A car-rental platform: a customer website with online booking and payment, an admin portal for staff, and a mobile app. TypeScript monorepo (Turborepo + pnpm), Next.js, Supabase (Postgres, row-level security, auth), Stripe, Resend and the Anthropic API.

The default branding is a Berlin car-rental company. Name, contact details, city, time zone and pick-up locations are settings, so one codebase can run for another company (see [Branding](#branding-white-label)).

## What it does

- **Customers:** browse vehicles, book (dates, extras, driver details, card payment), manage bookings, sign in with email or Google.
- **Staff (admin portal):** fleet and availability, calendar, bookings, customers, licence and damage reviews, maintenance, pricing, integrations and settings.
- **AI features** (server-side, always with a person in the loop): conversational vehicle search, extras recommendations, trip planner, driving-licence reading and damage detection (staff approve every result), maintenance notes.
- **Safety:** row-level security on every table, all writes through server routes, DB-backed rate limits, strict content-security headers, audit notes in `audits/`.

## Folder map

| Path | What is in it |
|---|---|
| `apps/web` | Customer website (Next.js, port 3002) |
| `apps/admin` | Admin portal (Next.js, port 3001, served under `/admin`) |
| `apps/mobile` | Mobile app (Expo, React Native) |
| `packages/` | Shared code: `api`, `config`, `supabase`, `types`, `ui`, `utils` (brand, licence, AI model list, helpers) |
| `supabase/` | `migrations/` (numbered SQL, apply in order), `seed*.sql`, `config.toml` |
| `docs/`, `audits/` | Product documentation and security/quality reviews |
| `e2e/`, `load-tests/` | Playwright end-to-end tests and load tests |
| `CLAUDE.md` | Working notes for the AI assistant: rules, gotchas, common issues |

## Run it on your computer

You need Node 20 or newer, pnpm 9.15 and a Supabase project (free tier is fine).

1. `pnpm install`
2. Copy `.env.example` to `apps/web/.env.local` and `apps/admin/.env.local`, and fill in your own Supabase, Stripe, Resend and Anthropic values. Never commit these files.
3. Apply the SQL in `supabase/migrations/` in order to your Supabase project.
4. `pnpm exec turbo run dev --parallel`, then open http://localhost:3002 (site) and http://localhost:3001/admin (staff).

## Tests

```
pnpm turbo lint
pnpm turbo type-check
pnpm turbo test           # unit tests
pnpm test:e2e             # Playwright, needs the dev server running
```

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit tests and a production build on every pull request, and the end-to-end tests on pull requests to `main`.

## Branding (white-label)

Settings use the `NEXT_PUBLIC_BRAND_*` variables (name, short name, legal name, city, country, time zone, phone, the contact, support, legal, privacy, bookings and corporate email addresses, support hours, pick-up locations). Defaults are in `packages/utils/src/brand.ts`.

## Licensing per deployment

Each deployment can be limited by a signed licence. It is off unless `LICENCE_ENFORCEMENT=1`; then `LICENCE_KEY` must hold a valid key, and the number of active vehicles is capped by the licence. The check only ever refuses to add or reactivate a vehicle, never removes one. See `packages/utils/src/licence.ts`.

## Contributing, security and licence

Work on a branch and open a pull request; keep CI green; add user-visible changes to [CHANGELOG.md](CHANGELOG.md). Database changes are new numbered migrations. To report a security problem, read [SECURITY.md](SECURITY.md).

All rights reserved. See [LICENSE](LICENSE).
