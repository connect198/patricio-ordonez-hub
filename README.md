# KINGDOM CONCIERGE™ — The Royal Guest Experience

*Every Guest. Honored. Every Moment. Extraordinary.*

A reusable, multi-event hospitality platform — first deployed for the **Kingdom Book Awards Gala 2026** (Nov 17, 2026 · Marriott Orlando Downtown).

| Area | What's inside |
|---|---|
| **Guest experience** `/e/:slug` | Arrival → name + private verification → personalized welcome with giant table reveal → program / ballroom map / announcements. Optional finalist book recognition (real covers + permission only). Low-bandwidth, reduced-motion, screen-reader friendly. |
| **Command Center** `/admin` | Live metrics, arrival & seating progress, needs-attention queue, live activity (Supabase Realtime). |
| **Guests** | Fuzzy search, filters, edit, companions, ticket confirmation, check-in corrections, CSV export, history. |
| **Royal Seating Designer** | Black-and-gold tables, drag & drop **and** accessible dropdowns, groups with companions, designations, conflict warnings, server-enforced capacity. |
| **Check-In** | Big-target staff UI, QR scanner, companions separately, exceptions, manager call, outstanding issues. |
| **Import** | Jotform API sync (server-side) + CSV upload with New / Updated / Duplicate / Incomplete / Error review. Staff-managed data is never overwritten. |
| **QR & Credentials** | Printable event signage, revocable private QR + codes (HMAC-hashed), QR for every event. |
| **Experience Director** | Welcome copy, VIP greetings, program, announcements, logo/artwork, opt-in music, celebrations, assistance requests. |
| **Platform** | Multi-event, roles (owner/manager/staff), audit log, demo event strictly isolated by DB triggers. |

## Architecture

```
Browser (React/Tailwind)  ──►  Netlify Functions (/api/*)  ──►  Supabase (service role, server only)
   │   guests: no DB access; only /api/event, /api/verify, /api/assist
   └── staff: Supabase Auth JWT → PostgreSQL via RLS (+ Realtime)
shared/        name matching, Jotform mapping & classification, types (used by both sides, unit-tested)
supabase/      migrations (schema, triggers/audit, RLS/storage/realtime) + seeds
```

**Privacy model:** `anon` can read *nothing*. The guest page only receives what `/api/verify` returns after a name **plus** a private code, personal QR token, or the registration email — never a directory. Credentials are random (192-bit tokens / 8-char codes), stored only as keyed HMACs, revocable, and shown once when issued.

## Quick start
See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Supabase → Netlify → first import) and **[docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md)**.

```bash
npm install && npm test && npm run build
```

## Honest notes
* Guest *seating* data is never fabricated: the only sample guests live in the optional, clearly-marked DEMO event.
* Jotform file URLs must be publicly reachable for covers/headshots to render (see deployment guide).
* Camera QR scanning requires HTTPS (Netlify provides it).
