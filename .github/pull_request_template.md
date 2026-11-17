## What and why

<!-- One or two sentences: what changes, and the problem it solves. -->

## Checklist

- [ ] Branch is `feat/…`, `fix/…`, `docs/…` or `chore/…`; nothing committed straight to `main`
- [ ] `pnpm turbo lint`, `pnpm turbo type-check` and `pnpm turbo test` pass
- [ ] No secrets, keys, personal data or `.env*` content in the diff (the Supabase `service_role` key never leaves the server)
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if users will notice the change
- [ ] Database change? A new numbered migration is included and RLS stays closed for client writes
- [ ] Deploy needed? Say what to run (migrations first), because merging deploys nothing; production deploys are manual
