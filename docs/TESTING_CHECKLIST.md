# Production Testing Checklist

Run against a **staging** copy first (separate Supabase project), then a short smoke test in production. Tick every box.

## A. Automated (run locally / CI)
- [ ] `npm test` — name matching, Jotform mapping, import classification, verification endpoint (generic failures, revoked creds, rate limit, honeypot, no private fields)
- [ ] `npm run build` — type-check + production build succeed
- [ ] Apply the three migrations to a blank Postgres; `psql -f tests/db_test.sql` shows only `PASS`

## B. Security
- [ ] Browser DevTools → Sources/Network: no `service_role`, Jotform key or pepper appears anywhere (search bundle for `SERVICE_ROLE`, `JOTFORM`)
- [ ] Anonymous `GET {SUPABASE_URL}/rest/v1/guests` with only the anon key returns `401/permission denied` (repeat for `seating_assignments`, `guest_credentials`, `audit_logs`)
- [ ] A signed-in **staff** user cannot edit a guest, confirm a ticket, seat guests or open Import/QR (UI redirects; API rejects)
- [ ] A user with no `admin_accounts` row sees "Access not yet granted" and no data
- [ ] A manager scoped to event A cannot see event B's guests
- [ ] Guest page: wrong code, wrong name and unknown email all show the *same* message; 25 rapid wrong attempts for one name return the rate-limit message
- [ ] Revoke a credential → its QR link and code stop working immediately
- [ ] Public sign-ups are disabled in Supabase Auth
- [ ] Response headers (securityheaders.com) show CSP, HSTS, frame-ancestors none

## C. Jotform import
- [ ] "Fetch submissions" returns **102** records (or the current count); no errors
- [ ] Review tabs show sensible New / Incomplete / Duplicate counts; skip & merge decisions are honoured
- [ ] Applying twice is refused ("already applied")
- [ ] Imported guests are **not** confirmed; Command Center "Confirmed" stays 0 until you confirm
- [ ] Manually set a table, ticket status, category and note on 3 guests → **re-run the sync** → those staff-managed values are unchanged
- [ ] Edit a book title in Jotform → re-sync shows it under *Updated records*
- [ ] CSV export from Jotform uploads and maps correctly (names, emails, titles, cover/headshot URLs, permissions)
- [ ] Demo event: import buttons are disabled

## D. Guest experience (test on iPhone Safari, Android Chrome, iPad, desktop)
- [ ] Scan the main QR → "Your Royal Evening Awaits." → Begin
- [ ] Partial / accented / slightly misspelled name + code works; name + registration email works
- [ ] Personal QR link verifies instantly and strips the secret from the address bar
- [ ] Confirmed guest sees "Welcome, First!" + giant table number; unconfirmed guest sees the gentle "see concierge" message and **no table**
- [ ] Finalist with cover + marketing permission shows the book; without either, no book panel and no broken image
- [ ] VIP / Distinguished / Speaker / Sponsor / Companion greetings match Experience Director settings
- [ ] Table Location highlights the right table; Program and Announcements display; "My Table" returns instantly
- [ ] Need Assistance → request appears in Command Center / Experience Director in seconds
- [ ] Low-bandwidth mode removes images and effects; throttle to "Slow 3G" — page remains usable
- [ ] OS "Reduce motion" on → no animations; screen reader (VoiceOver/TalkBack) announces headings, errors and table number; keyboard-only navigation works with visible focus
- [ ] Music (if enabled) never plays until the guest taps the button

## E. Staff & admin
- [ ] Check-in: search "partial name" → tap → one big button → guest checked in; counts update on a second device within seconds
- [ ] Companion check-in is separate from host; undo check-in is logged as a correction
- [ ] Unconfirmed guest: staff blocked, manager override works and is audited
- [ ] Camera QR scan resolves a guest (HTTPS required for camera); manual code entry works
- [ ] Flag exception + "Call manager" (phone set in Experience Director) work
- [ ] Seating: create 5 tables (bulk), drag a guest, use dropdown move, seat a group with companions, try to over-fill (blocked), shrink capacity below seated (blocked), reserved/designation warnings appear
- [ ] Guests: filters, CSV export, edit, add companion, unlink companion
- [ ] Activity page lists every action with who/when; CSV export works
- [ ] Print: main QR sign prints on one page; credential cards print alone
- [ ] Kill Wi-Fi mid-session: "Reconnecting" badge shows, actions fail with a clear message, data self-heals on reconnect

## F. Go-live
- [ ] Event status = **Live**; QR sign printed and scanned from 2 m away on 3 phones
- [ ] `VITE_DEMO_PREVIEW` is unset; demo event hidden from guests (status draft/closed) or clearly labelled
- [ ] Supabase backups on; manager phone set; at least 2 staff devices pre-signed-in with charging
- [ ] Final Guests + Activity CSV exported
