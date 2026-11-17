# Security policy

## Reporting a problem

Please do not open a public issue for a security problem. Email **info@facyke.com** with what you found and where (page, endpoint or file), how to reproduce it, and what an attacker could do with it. You will get a first reply within 5 working days.

## What is in scope

The code in this repository: the customer website, the admin portal, the mobile app, the Supabase migrations (row-level security) and the AI routes. Past reviews are in `audits/`.

## Running it safely

- Never commit `.env` or `.env.local`. Use your own Supabase, Stripe, Resend and Anthropic keys, per environment.
- The Supabase `service_role` key bypasses all row-level security. It belongs only on the server, never in the browser, a mobile build, a script or a document.
- All writes go through server routes using the service-role client; never add client-facing INSERT/UPDATE policies on `bookings` or `user_profiles`.
- If a key is ever committed or pasted somewhere public, rotate it immediately: removing it from the files does not revoke it.

## Supported versions

Only `main` receives fixes.
