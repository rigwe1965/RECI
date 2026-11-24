# Changelog

All notable changes to RECI Transport. Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions use `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added
- README, LICENSE, SECURITY.md, this changelog, a pull request template and Dependabot config (project standard).
- White-label branding settings (`NEXT_PUBLIC_BRAND_*`), footer settings and a per-deployment vehicle licence (off unless `LICENCE_ENFORCEMENT=1`).

### Fixed
- The seed scripts (`seed.mjs`, `seed_demo.mjs`, root and `apps/web`) added every extra again on each run (the `extras` table has no unique name, so `upsert()` had nothing to match): a demo seeded 16 times showed each extra 16 times. They now update the extras that exist and insert only the missing ones.

### Changed
- Repository made public (all rights reserved; viewing and evaluation only) so CI runs without billing.

Earlier history is in the git log. The first tagged release will be `v0.1.0`.
