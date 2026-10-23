# Kingdom Concierge™ — Deployment Guide

Stack: React + TypeScript + Tailwind (Vite) · Supabase Auth + PostgreSQL + Realtime + Storage · Netlify + Netlify Functions.

## 1. Supabase (≈10 minutes)

1. Create a project at supabase.com (choose a region near Orlando, e.g. *East US*).
2. **SQL Editor → run, in order:**
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_functions_triggers.sql`
   3. `supabase/migrations/0003_rls.sql`
   (or `supabase db push` with the CLI.)
3. **Authentication → Users → Add user** for the first owner (email + password), then run `supabase/seed/first_owner.sql` with that email.
4. **Authentication → URL Configuration:** set *Site URL* to your Netlify URL and add `https://YOUR-SITE/admin` to *Redirect URLs* (needed for magic-link, password-reset and staff invitations).
5. **Authentication → Providers → Email:** keep *Confirm email* on; **disable public sign-ups** (Authentication → Sign In / Providers → "Allow new users to sign up" off). Staff are added only by invitation/owner. Even if sign-ups were open, a user without a row in `admin_accounts` can read nothing (RLS).
6. Run `supabase/seed/first_event.sql` to create *Kingdom Book Awards Gala 2026* (draft, Jotform form `261778660839070`).
7. *(Optional)* run `supabase/seed/demo_seed.sql` to add the clearly-labelled **DEMO** event (George Vasquez T13, Maria Rodriguez T5, David Thompson T8). Database triggers make it impossible for imports to write into the demo event or for demo guests to move into a real event.
8. Copy from **Project Settings → API**: Project URL, `anon` key, and `service_role` key.

## 2. Jotform API key

Jotform → *Settings → API → Create New Key* (**Read Access** is enough). Keep it for the Netlify variables below. For EU accounts also set `JOTFORM_API_BASE=https://eu-api.jotform.com`.

> Book covers / headshots: Jotform file-upload URLs must be publicly reachable for the guest screens to display them. If images don't load, enable public access to uploaded files in the form's settings, or download and re-host them (Experience Director → Artwork). The app never fabricates a cover: no image ⇒ no book panel.

## 3. Netlify

**How to upload.** Netlify's drag-and-drop box only hosts static files, so it would skip the server functions (verification, import, QR credentials) and the app would not work. Use one of these:

* **Netlify CLI from the ZIP (no GitHub needed):** unzip `kingdom-concierge.zip`, open a terminal in that folder, then `npm install`, `npm i -g netlify-cli`, `netlify login`, `netlify init` (create a new site), add the variables below (`netlify env:set NAME value`), and run `netlify deploy --build --prod`.
* **Git:** push the folder to a GitHub repo, then Netlify → *Add new site → Import an existing project*. Later pushes redeploy automatically.

Before either, run `npm run check` (typecheck, tests, function bundling, build). All must pass.


1. New site → import the Git repository (or drag the ZIP's contents). Build command `npm run build`, publish dir `dist`, functions dir `netlify/functions` (already in `netlify.toml`).
2. **Site settings → Environment variables**:

| Variable | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | build (public) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | build (public) | `anon` key — safe in the browser; RLS protects data |
| `VITE_PUBLIC_SITE_URL` | build (public, optional) | e.g. `https://concierge.yourdomain.com` |
| `VITE_DEMO_PREVIEW` | build | leave **unset/false** in production |
| `SUPABASE_URL` | functions (**secret**) | same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | functions (**secret**) | `service_role` key — **never** prefix with `VITE_` |
| `CREDENTIAL_PEPPER` | functions (**secret**) | `openssl rand -hex 32` — changing it invalidates every issued QR/code |
| `RATE_LIMIT_SALT` | functions (**secret**) | `openssl rand -hex 16` |
| `JOTFORM_API_KEY` | functions (**secret**) | your Jotform key |
| `JOTFORM_API_BASE` | functions | `https://api.jotform.com` (or EU) |
| `JOTFORM_FORM_ID` | functions | `261778660839070` |
| `PUBLIC_SITE_URL` | functions | same as the site URL; used in personal QR links and invitations |
| `ALLOWED_IMAGE_HOSTS` | functions (optional) | extra comma-separated image hosts |

   Mark the secret ones with *Contains secret values* so they are hidden from build logs.
3. Deploy. Add your custom domain (HTTPS is automatic).

## 4. First-day workflow

1. Sign in at `/admin`. **Settings & Team** → set the event to *Draft* until ready, invite managers/staff.
2. **Import** → *Fetch submissions & preview* (or upload a CSV). Review New / Updated / Possible duplicates / Incomplete / Errors, choose what to include, **Apply**. The 102 finalists arrive as **records** — not confirmed attendees.
3. **Guests** → set *Attendance → Confirmed* for each finalist/guest who holds a ticket (and add companions, VIPs, speakers, sponsors). Only confirmed guests count toward seating, check-in totals and the guest table reveal.
4. **Seating** → create tables (bulk-create supported) → drag or use dropdowns to seat guests, **or** upload your existing seating chart with *Import seating CSV* (columns: `table` plus `name` or `email`; matched to imported records, nothing is invented).
5. **Experience Director** → welcome copy, VIP greetings, program, announcements, logo/artwork, optional music (never autoplays), manager phone for staff.
6. **QR & Credentials** → *Issue credentials* for confirmed guests (export CSV for mail-merge / print cards). Guests without one can still verify with **name + the email they registered with**.
7. **Settings** → set the event to **Live**. Print the main QR sign from **QR & Credentials**.
8. At the door: staff open **Check-In** on phones/tablets (large touch targets, QR scanner, manager call button).

## 5. Local development

```bash
npm install
cp .env.example .env        # fill in values
npm run dev:netlify         # needs the Netlify CLI: npm i -g netlify-cli  (serves functions at /api/*)
npm test                    # unit tests (name matching, Jotform mapping, verification logic)
npm run build
```
Visual-only preview of the guest flow without any backend: `VITE_DEMO_PREVIEW=true npm run dev` then open `/e/demo-kingdom-gala` (sample guests, every screen labelled DEMO).

## 6. Package a ZIP

`npm run zip` → `kingdom-concierge.zip` (source only: no `node_modules`, no `.env`, no build output).

## 7. Operating notes

* **Roles** — `staff`: search/check-in/flag; `manager`: + guests, tickets, seating, import, credentials, Experience Director; `owner`: + events and team.
* **Realtime** — dashboards use Supabase Realtime, plus a 60-second reconcile and refresh-on-focus so a flaky venue network self-heals. A "Reconnecting" badge shows when the socket is down.
* **Scale** — guest lookups are served by Netlify Functions with edge-cacheable event data; the verification endpoint is rate-limited per-IP (generous, since a venue shares one IP), per-event and per-targeted-name. Admin tables load the event's records once (paged past 1,000 rows) and search client-side.
* **Backups** — enable Supabase daily backups / PITR before the event. Export Guests CSV and Activity CSV the morning of.
* **Key rotation** — rotate the Jotform key or service-role key in Netlify, then redeploy. Rotating `CREDENTIAL_PEPPER` invalidates all guest credentials (re-issue them).
