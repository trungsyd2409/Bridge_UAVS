# BRIDGE

**Know Your Rights: A Safe Bridge for Vietnamese Migrant Workers**
UAVS Hackathon 2026 — challenge set by Reclaim Migrant Workers Centre NSW

**Live demo: https://bridge.trung-syd2409.workers.dev**

A Vietnamese-first workplace rights app. Workers record their own shifts, ask
questions in plain Vietnamese and get answers grounded in Fair Work guidance
with sources attached, then get pointed to real human help.

---

## The problem, and where each answer lives in the app

The RMWC brief gives three numbers. Each one is answered by a specific screen.

| From the brief | Where the app answers it |
|---|---|
| 38% do not seek help because they fear it will affect their visa | First newsroom item on the home screen: contacting Fair Work does not affect your visa |
| 62% of underpaid workers believe they themselves broke the law | Assistant answers state plainly that being underpaid is not the worker's fault |
| Only 25% of Vietnamese temporary residents receive the minimum casual rate | Job check and the assistant's pay comparison |

---

## What it does

**Shift journal.** Multiple jobs, multiple workplaces, planned and actual shifts,
overnight shifts, unpaid breaks, timezone and DST aware hours, overlap warnings.
Payment state per shift: unknown, unpaid, part paid, paid, plus payslip status.

Why this matters: under **Fair Work Act 2009 (Cth) s 557C**, where an employer
fails to keep records or issue payslips, the burden of disproof shifts to the
employer. A worker's own contemporaneous record then carries real weight. The app
does not litigate for anyone; it helps a worker walk in holding something.

**AI assistant.** Vietnamese questions in, structured answers out: what may be
happening, why it matters, what you can do, what evidence to keep, who can help.
Every answer carries numbered sources and a legal-information disclaimer, and
every answer offers a route to a human. Retrieval runs over a vetted Fair Work
corpus; the model never supplies pay figures from memory, those come from a
lookup table in code.

**Job check.** Industry, employment type, role, agreed rate, hours, optional ABN.
Returns a checklist of what to verify rather than a verdict.

**Interface.** Vietnamese and English, light/dark/system, reduced-motion honoured,
responsive from 375px to desktop, installable via web manifest.

**Privacy.** No account, no email, no server-side user data. The shift journal is
encrypted on the device with a password the user sets: PBKDF2-SHA256 at 250,000
iterations, AES-GCM, fresh salt and IV on every write. The key is never stored.
Locking or reloading clears decrypted records from memory. There is no password
recovery and no cross-device sync, by design.

---

## Honest limits

These are stated plainly because a wrong number here would harm the exact people
this app is for.

- **Pay comparison uses the national minimum wage, not award rates.** The lookup
  table in `lib/assistant/wages.ts` carries the national minimum with its
  effective date. **Most awards set higher rates**, plus penalty rates for
  weekends, public holidays and nights. Being above the national minimum does not
  mean a worker has been paid correctly, and every answer says so. Connecting the
  Fair Work Commission Modern Awards Pay Database is the next step.
- **The figures in that table must be re-verified against fairwork.gov.au before
  any public release.**
- **No RMWC referral summary yet.** The brief's Safe Referral Pathways section
  asks for a consented structured summary of concern, dates, evidence, preferred
  language and assistance type. Not built.
- **ABN lookup opens the official register only.** Nothing is imported, and an
  active ABN says nothing about whether an employer pays correctly.
- Legal content requires professional review before public release.
- All job, rate, time and payment records are self-reported and unverified.
- Network required to open; no offline service worker.
- There is no RMWC endorsement of this prototype.

**Scope.** BRIDGE provides legal *information*, not legal *advice*. It does not
conclude that anyone broke the law and does not lodge complaints. It routes to
RMWC, the Fair Work Ombudsman and TIS National.

---

## Stack

Next.js App Router on **vinext** + Vite, React 19, TypeScript, Tailwind CSS v4,
shadcn components, deployed as a **Cloudflare Worker**. Gemini for NLU, reranking
and answer generation. Retrieval reads `lib/assistant/rag-data.json`, a vector
index exported from the Python pipeline (Cloudflare Workers has no `node:sqlite`,
so the SQLite build is exported to JSON at build time).

Requires **Node 22.5+** and **pnpm**.

## Run locally

```bash
corepack enable
pnpm install
cp .dev.vars.example .dev.vars   # then paste GEMINI_API_KEY into it
pnpm dev
```

Opens on **http://localhost:5173**.

Without a key the app still runs: keyword intent detection, corpus retrieval and
prepared answers, still with sources. Only the generated prose is missing.

## Checks

```bash
node node_modules/typescript/bin/tsc --noEmit
node --test tests/work-model.test.mjs
pnpm build
```

Tests cover leap years, year rollover, Sydney and Lord Howe DST, overnight hours,
overlap boundaries, legacy migration, encryption round trips, wrong-password
rejection and tamper rejection. **7/7 passing.**

## Deploy

```bash
npx wrangler login
npx @vinext/cloudflare deploy
npx wrangler secret put GEMINI_API_KEY --name bridge
```

Do not declare `compatibility_flags` in `wrangler.jsonc` — the generated
`dist/server/wrangler.json` already sets `nodejs_compat`, and declaring it twice
fails deployment with error 10021.

Secrets live in Cloudflare, never in the repo. `.dev.vars` is gitignored;
`.dev.vars.example` is the committed template.

---

## Layout

```
app/page.tsx              main UI flow
app/work-hub.tsx          jobs, calendar, shifts, payments
app/job-fields.tsx        industry, employment type, ABN
app/bridge-ui.tsx         brand marks and the animated assistant orb
app/api/assistant/route.ts   POST /api/assistant
lib/assistant/            NLU, retrieval, rerank, grounding, answer, wages
lib/assistant/rag-data.json  exported vector index
lib/work-model.ts         dates, DST, encryption, legacy migration
tests/work-model.test.mjs
```

Assistant integration contract:

```
POST /api/assistant
  { message: string, lang: "vi"|"en", profile: { visa, industry, employment } }
→ { response: { answer: { whatIsHappening, whyItMatters, whatToDo[],
                          evidenceToKeep[], whoCanHelp[], citations[], grounding },
                sources[], urgent, intent, risk, mode, disclaimer } }
```

---

## Submission

This repository is the UAVS Hackathon 2026 submission. `trungsyd2409/Bridge` is
an earlier working repository kept for history and is not the submission.

`public/cafe-worker.png` and `public/sydney-harbour.png` are original generated
illustrations, not news photographs. The bridge logo and handshake are drawn in
code. Visa labels reference the Home Affairs visa directory; they do not
establish eligibility or current visa conditions.
