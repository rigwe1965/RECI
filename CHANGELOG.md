# Changelog

All notable changes to RECI Transport. Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions use `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added
- README, LICENSE, SECURITY.md, this changelog, a pull request template and Dependabot config (project standard).
- White-label branding settings (`NEXT_PUBLIC_BRAND_*`), footer settings and a per-deployment vehicle licence (off unless `LICENCE_ENFORCEMENT=1`).

### Changed
- Tailwind CSS 3 → 4 for the web and admin apps (`@tailwindcss/postcss`, CSS-first config). The design tokens moved from `packages/config/tailwind/index.ts` to `packages/config/tailwind/theme.css`, which both apps import. Pages compared before and after in screenshots: no visible change.

### Fixed
- `.env.example` listed `SENTRY_DSN` and `NEXT_PUBLIC_ADMIN_URL`, which nothing reads: the apps read `NEXT_PUBLIC_SENTRY_DSN` (so error monitoring stayed off when set as documented) and `ADMIN_URL`. Both corrected.
- The licence settings (`LICENCE_ENFORCEMENT`, `LICENCE_KEY`) were documented in the root `.env.example`, but only the admin app reads them and each Next.js app loads only its own `.env.local`; they are now in `apps/admin/.env.example`, with the admin app's `ANTHROPIC_API_KEY` (maintenance assistant).
- Settings the code reads were missing from the examples: `INTERNAL_APP_URL`, `AI_VISION_PROVIDER`/`AI_VISION_BASE_URL`/`AI_VISION_API_KEY`, and `ADMIN_EMAIL`/`ADMIN_PASSWORD` for `create_admin.mjs`. `packages/utils/src/env-example.test.ts` now fails when an app reads a setting its own `.env.example` does not list, or an example lists a setting nothing uses.
- The seed scripts (`seed.mjs`, `seed_demo.mjs`, root and `apps/web`) added every extra again on each run (the `extras` table has no unique name, so `upsert()` had nothing to match): a demo seeded 16 times showed each extra 16 times. They now update the extras that exist and insert only the missing ones.

### Changed
- Repository made public (all rights reserved; viewing and evaluation only) so CI runs without billing.
- Default AI models (used when no `AI_MODEL*` variable is set and the admin has not picked a model): Sonnet 5.5 for chat, search, trip, corporate and vehicle-photo features (was Sonnet 4.6), Haiku 5.5 for extras suggestions and maintenance notes (was Haiku 4.5). The old models can still be set.
- The AI call log (`ai_conversations.model_used`) recorded every call as `claude-sonnet-4-6`, because no caller passed the model. Chat and trip now log the model they used; damage and licence (through the vision adapter) log nothing rather than a guess.

Earlier history is in the git log. The first tagged release will be `v0.1.0`.
