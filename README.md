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
- Live AI assistant at `/api/assistant`. A question in Vietnamese or English is classified (intent, entities, risk), searched against 239 chunks of Fair Work guidance (768-dimension vectors plus BM25, fused with reciprocal rank fusion, then rescored by Gemini), and answered in five parts with numbered citations back to the source pages. Answers follow the interface language.
- The retrieval layer runs entirely inside the Worker: `lib/assistant/rag-data.json` carries the exported corpus, vectors and BM25 index, so there is no database call and no second service. The BM25 scoring reproduces SQLite FTS5 `bm25(context_header 2.0, content 1.0)` exactly, and the Porter stemmer matches SQLite's `porter unicode61` tokenizer on the whole corpus vocabulary.
- Emergency block (000, Lifeline, TIS National, police) is generated in code from keyword scanning, not by the model, so it still appears when the model fails.
- Graceful degradation: no API key, a network failure or a model outage falls back to keyword-only retrieval and prepared per-topic answers, and the interface labels the answer as prepared. Money figures in a generated answer must trace back to the evidence or to the user's own words, or the answer is discarded in favour of the prepared one.
- The assistant never reads the encrypted work journal. Chat history is kept in React state only and is not stored on the server.
- Installable manifest and icons. Network required to open; no offline service worker.
- / and /home; sections use hash navigation. Feature-detected WebMCP navigation does not submit/export/unlock data.

## Boundaries

Live ABN lookup, visa verification, complete searchable visa catalogue, award calculations, voice input, attachment uploads and formal audit history are not connected. Optional employer ABN is recorded in encrypted job records or the temporary Job check form. Copy and open the official ABN Lookup site to search manually; no results or verified status are imported. Job check prefills industry/employment from the profile and shows them in its result. Chat sends the question and the onboarding profile codes to the Bridge server, which calls Gemini; it never sends the journal. Answers are general information, not legal advice, and every screen says so. There is no implied RMWC endorsement. Legal guides and links require professional review before public release. All job/rate/time/payment records are self-reported, not independently verified.

## Validation

Run `node --test tests/work-model.test.mjs` for leap years, year rollover, timezone dates, Sydney and Lord Howe DST, overnight hours, overlap boundaries, legacy migration, encryption round trips, wrong-password rejection and tamper rejection. TypeScript and the production build are checked for this milestone. Browser visual/E2E and WebMCP runtime validation have not been performed.

## AI configuration

Copy `.dev.vars.example` to `.dev.vars` and set `GEMINI_API_KEY` (free key from https://aistudio.google.com/apikey). `.dev.vars` is the Cloudflare Workers local-secrets file and is gitignored; in production set the same variables under the Worker's Variables and Secrets. Optional: `ABN_LOOKUP_GUID` enables direct ABN lookups, `RAG_FAKE_GEMINI=1` runs the whole flow without calling Gemini, `AI_SKIP_RERANK=1` trades accuracy for speed. Without a key the app still runs on keyword search and prepared answers. No extra npm dependency was added: the Gemini calls are plain `fetch` against the REST API.

## Deployment

The project targets **Cloudflare Workers** natively (vinext + `@cloudflare/vite-plugin` + wrangler). `wrangler.jsonc` holds the Worker name, compatibility date and asset binding; `vite.config.ts` layers the Sites hosting bindings on top of it.

```bash
npx wrangler login                       # once
npx @vinext/cloudflare deploy
npx wrangler secret put GEMINI_API_KEY   # after the first deploy
```

`.dev.vars` covers local dev only — production reads Worker secrets. Deploying before the secret exists is safe: the assistant falls back to keyword search and prepared answers until the key is set. Add `account_id` to `wrangler.jsonc` only if your Cloudflare login has more than one account.

**Vercel** is supported through the Nitro Vite plugin. `vite.config.ts` picks the target automatically: it uses Cloudflare unless `VERCEL`, `NITRO_PRESET` or `DEPLOY_TARGET=nitro` is set, in which case it swaps in Nitro and shims `cloudflare:workers` to `process.env`. One-time setup:

```bash
pnpm add -D nitro          # commit the updated pnpm-lock.yaml
```

Then push the repo and import it on Vercel. `vercel.json` already sets Framework Preset to none and the build command to `vite build`, so leave the Output Directory empty — Nitro writes Vercel's Build Output API format and Vercel picks it up. Add `GEMINI_API_KEY` (and optionally `ABN_LOOKUP_GUID`) under Settings → Environment Variables for Production, Preview and Development.

This checkout pins pnpm 11 in `packageManager` and uses pnpm-11 keys in `pnpm-workspace.yaml`, which Vercel's bundled pnpm 9/10 does not understand. Add an environment variable `ENABLE_EXPERIMENTAL_COREPACK` = `1` to the Vercel project so it installs with the pinned pnpm instead.

To reproduce the Vercel build locally: `NITRO_PRESET=vercel npx vite build` (PowerShell: `$env:NITRO_PRESET="vercel"; npx vite build`).

Vercel Functions default to a 300-second maximum duration on every plan with Fluid compute, which is well above the assistant's worst case (roughly 25 seconds), so no `maxDuration` override is needed.

## Development and source

Preserve pnpm-lock.yaml and the existing Sites configuration. Use `node node_modules/typescript/bin/tsc --noEmit`, the tests above and the established build scripts. No secrets are required for this local-data beta. This checkout is backed by the Site’s source repository, not yet linked to the team’s separate GitHub repository. Open the checkout in VS Code for further development.

`public/cafe-worker.png` and `public/sydney-harbour.png` are original generated illustrations; they are not news photos. Bridge logo and handshake use code-native brand geometry and Lucide icon shapes. Visa suggestion labels reference the Home Affairs skilled occupation list and visa directory; suggestions do not establish eligibility or current visa conditions.
