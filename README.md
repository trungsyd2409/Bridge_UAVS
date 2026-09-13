# BRIDGE beta

Vietnamese/English responsive workplace journal and rights-guidance prototype, based on the team’s approved BRIDGE proposal and blue UI.

## Working in this beta

- Navy sidebar, pale-blue header, mobile navigation, light/dark/system themes and VI/EN interface.
- Bridge-opening and handshake splash; animated abstract blue assistant orb. Both honour reduced motion.
- Five-step onboarding (language, nickname, industry, employment type, residency/visa), editable profile context, suggested work visas and manual entry for any visa. Suggestions are explicitly not the entire visa catalogue. Official Home Affairs directory is linked.
- Unlimited jobs with role, 15 industry groups plus other/unsure, employment type, calendar colour, multiple workplaces/addresses/timezones, prospective/active/archived status.
- Week/month calendar with actual current dates, leap years, year boundaries, today navigation and 15-second rollover checks. Calendar timezone defaults to Australia/Sydney and can be changed.
- Planned and actual shifts, explicit overnight end date, unpaid breaks, workplace timezone/DST-aware elapsed hours, explicit choice for repeated times and rejection of skipped DST times. Overlap warnings cover all jobs.
- Agreed hourly rates snapshot into each shift. Future rate edits do not rewrite saved shifts. This is not an award/minimum wage engine.
- Unknown/unpaid/part-paid/paid payment states, received amount/date/method, payslip status, notes and last-update timestamps. Planned shifts convert to actual only after user review; the prior planned duration is not retained as a separate baseline in this beta.
- Device-local encrypted jobs and shifts. PBKDF2-SHA256 250,000 iterations, AES-GCM, random salt and fresh IV on every write. Password/key never persisted; lock or reload clears decrypted records from app state.
- Reads previous encrypted array-format journals without changing ciphertext on unlock. Migration keeps original notes/payment values; historical timezone is explicitly assumed Sydney and old positive payments are marked part-paid, not confirmed complete.
- JSON export, confirmed journal/shift deletion, protection against stale writes after another tab changes the journal. No cross-device sync or password recovery. Export is unencrypted.
- Four free-text learning scenarios with prepared comparison guidance; official support links and Fair Work newsroom link.
- Installable manifest and icons. Network required to open; no offline service worker.
- / and /home; sections use hash navigation. Feature-detected WebMCP navigation does not submit/export/unlock data.

## Boundaries

Live AI, live ABN lookup, visa verification, complete searchable visa catalogue, award calculations, voice input, attachment uploads and formal audit history are not connected. Optional employer ABN is recorded in encrypted job records or the temporary Job check form. Copy and open the official ABN Lookup site to search manually; no results or verified status are imported. Job check prefills industry/employment from the profile and shows them in its result. Chat is clearly labelled as prepared topic guides, not an AI analysis; it never reads the journal or sends prompts externally. There is no implied RMWC endorsement. Legal guides and links require professional review before public release. All job/rate/time/payment records are self-reported, not independently verified.

## Validation

Run `node --test tests/work-model.test.mjs` for leap years, year rollover, timezone dates, Sydney and Lord Howe DST, overnight hours, overlap boundaries, legacy migration, encryption round trips, wrong-password rejection and tamper rejection. TypeScript and the production build are checked for this milestone. Browser visual/E2E and WebMCP runtime validation have not been performed.

## Development and source

Preserve pnpm-lock.yaml and the existing Sites configuration. Use `node node_modules/typescript/bin/tsc --noEmit`, the tests above and the established build scripts. No secrets are required for this local-data beta. This checkout is backed by the Site’s source repository, not yet linked to the team’s separate GitHub repository. Open the checkout in VS Code for further development.

`public/cafe-worker.png` and `public/sydney-harbour.png` are original generated illustrations; they are not news photos. Bridge logo and handshake use code-native brand geometry and Lucide icon shapes. Visa suggestion labels reference the Home Affairs skilled occupation list and visa directory; suggestions do not establish eligibility or current visa conditions.
