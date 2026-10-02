# Sales Agent

A general-purpose B2B outbound sales agent. You describe a campaign in free text —
in any language, about any industry, in any country — and the agent interprets the
brief, builds its own search strategy, finds companies, researches them, scores
them against *that* brief, finds a decision maker, writes one personalised
first-touch email, sends it, watches for a reply, and stops the moment one arrives.

Nothing about a vertical, a country, a language or a buyer persona is hardcoded.
The campaign brief is the only source of truth. These four briefs run through the
same code with no changes:

> Find German manufacturing companies with 20-200 employees that appear to have
> manual administrative processes. I want to sell AI workflow automation. Target
> CEO, COO or Head of Operations.

> Nájdi slovenské športové kluby v kolektívnych športoch. Chcem im ponúknuť
> vytvorenie vlastnej klubovej hymny.

> Find US SaaS companies expanding into Europe. I want to sell localization and
> multilingual customer support. Target founders, Heads of Growth or Localization
> Managers.

> Nájdi účtovnícke firmy na Slovensku s minimálne 5 zamestnancami. Chcem im
> predávať AI voice agenta na zdvíhanie telefonátov.

## Table of contents

- [What it does](#what-it-does)
- [The rules it will not break](#the-rules-it-will-not-break)
- [Architecture](#architecture)
- [Setup](#setup)
  - [1. PostgreSQL](#1-postgresql)
  - [2. Ollama](#2-ollama)
  - [3. Environment](#3-environment)
  - [4. Migrations and seed](#4-migrations-and-seed)
  - [5. Run it](#5-run-it)
- [SMTP and IMAP (Websupport or any provider)](#smtp-and-imap-websupport-or-any-provider)
- [Environment variables](#environment-variables)
- [Using it](#using-it)
- [How providers work](#how-providers-work)
- [The job runner](#the-job-runner)
- [Rate limiting and scheduling](#rate-limiting-and-scheduling)
- [Verifying an installation](#verifying-an-installation)
- [Production deployment](#production-deployment)
- [Security notes](#security-notes)
- [Project layout](#project-layout)
- [Current limitations](#current-limitations)

## What it does

For each campaign the agent runs this pipeline, one job per step:

| Step | What happens | Where |
| --- | --- | --- |
| 1. Interpret the brief | Free text → structured campaign config you can edit | `agent/campaign-interpreter.ts` |
| 2. Build a search strategy | The model writes its own queries, signals and page list | `agent/search-strategy.ts` |
| 3. Discover companies | Real search results → candidate domains → one lead each | `agent/discovery.ts` |
| 4. Research | Reads the homepage, then the pages *the model picks for this brief* | `agent/research.ts` |
| 5. Qualify | Scores against the campaign's own rubric and minimum | `agent/qualification.ts` |
| 6. Find a contact | Right role first, then founder/owner, then a shared mailbox | `agent/contact-discovery.ts` |
| 7. Write the email | One first-touch email, built only on sourced evidence | `agent/email-generation.ts` |
| 8. Validate | ~20 independent pre-send checks, all evaluated | `agent/validation.ts` |
| 9. Send | SMTP, spread across working hours with a randomised gap | `agent/scheduler.ts`, `agent/send.ts` |
| 10. Watch for replies | IMAP, matched by `In-Reply-To` → `References` → sender | `agent/imap-sync.ts` |
| 11. Stop | A reply halts all automation for that contact, permanently | `agent/dedup.ts` |

Every step writes an `AgentLog` row, so the dashboard can always answer *why* —
why this lead qualified, why that one was rejected, why an email was not sent.

## The rules it will not break

These are enforced in code, not only in the prompt, and are covered by
`npm run selfcheck`:

- **Nothing is sent from a new campaign.** Every campaign starts `DRAFT_ONLY`.
  Automatic sending requires a deliberate switch to `AUTOMATIC`, which in turn
  requires that a human has reviewed and saved the interpretation.
- **No follow-ups, ever.** The agent generates and sends exactly one email per
  lead. There is no sequence engine, and no code path that creates a second send.
- **A reply ends automation.** The contact is flagged `globalDoNotAutoContact`,
  every lead for them stops, their queued jobs are cancelled, their unsent drafts
  are discarded, and the address is added to the suppression list. From then on
  the conversation is yours.
- **No invented email addresses.** The model may only return an address that
  literally appeared in the material it was given. Anything else is discarded by
  the code, not just discouraged by the prompt — and the lead is rejected rather
  than contacted. An address derived from an observed company pattern is stored as
  `GUESSED`, which is below the default send threshold.
- **No invented facts.** Personalisation must rest on a `LeadEvidence` row that has
  a source URL. A draft with no sourced evidence is refused outright.
- **No duplicate contact.** Deduplicated on address, on the person, on the company
  domain within a campaign, and across campaigns.
- **Suppression is absolute.** Checked when the draft is created and again
  immediately before the send, because a reply may have arrived in between.
- **Quality over quantity.** The agent is expected to reject leads. It will never
  send an email merely to reach the daily number; if it finds fewer good leads than
  you asked for, the dashboard shows the real figure.

## Architecture

```
src/
  app/                      Next.js App Router
    (dashboard)/            Overview · Campaigns · Leads · Inbox · Suppression · Settings
    actions/                Server actions (all mutations)
    api/
      jobs/tick             POST — schedule due sends, then drain N jobs
      imap/sync             POST — pull new mail, detect replies
      health                GET  — configuration report, no credentials
  components/               UI kit, status badges, forms (client components)
  lib/
    llm/                    Provider interface, Ollama, OpenAI-compatible,
                            Zod schemas + JSON Schemas, prompts, JSON extraction
    providers/
      search/               none · serper · brave · google_cse
      verification/         none · hunter
      enrichment/           none · hunter
      email/                SMTP (Nodemailer)
      imap/                 ImapFlow + mailparser
    tools/                  searchWeb · searchCompanies · searchJobs · visitWebsite
                            extractCompanyData · findContact · verifyEmail
                            scoreLead · writeEmail · sendEmail
    agent/                  One module per pipeline step, plus the job queue,
                            runner, scheduler, dedup and pre-send validation
    db.ts env.ts settings.ts logger.ts queries.ts
prisma/
  schema.prisma             15 models
  migrations/
  seed.ts                  Two unrelated demo campaigns
scripts/
  worker.ts                Long-running worker (alternative to cron)
  selfcheck.ts             Verifies the safety gates against your database
```

The deliberate shape: **no single large `agent.ts`**. Each tool is its own service
with its own interface, each pipeline step is its own module, and each external
dependency sits behind an interface with a null implementation.

### Structured output

Every LLM call goes through `completeStructured()`, which:

1. sends a JSON Schema to the provider so it can constrain decoding
   (Ollama's `format`, OpenAI's `response_format: json_schema`);
2. strips reasoning blocks, markdown fences and trailing prose from the reply;
3. validates the result with Zod;
4. on failure, re-asks with the validation error fed back (twice by default);
5. throws if it still does not validate.

No behaviour anywhere depends on regex-scraping prose, and **no email can be built
from an output that failed validation**.

## Setup

Requirements: Node.js 20+, PostgreSQL 14+, and Ollama (or any OpenAI-compatible
endpoint).

```bash
cd sales-agent
npm install
```

### 1. PostgreSQL

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16
createdb sales_agent

# Debian/Ubuntu
sudo apt install postgresql
sudo -u postgres createuser --pwprompt sales_agent
sudo -u postgres createdb --owner=sales_agent sales_agent

# Docker
docker run -d --name sales-agent-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sales_agent postgres:16
```

### 2. Ollama

```bash
# https://ollama.com/download
ollama serve
ollama pull qwen3      # or any model you prefer — the name is never hardcoded
```

A model that follows JSON Schema reliably works best. `qwen3` is the default
suggestion, not a requirement; set `OLLAMA_MODEL` to whatever you pulled, or change
it later in **Settings** without touching `.env`.

### 3. Environment

```bash
cp .env.example .env
$EDITOR .env          # at minimum: DATABASE_URL, OLLAMA_MODEL
```

The application starts with nothing but `DATABASE_URL`. Every unconfigured
capability degrades to a clearly labelled *"Provider not configured."* state rather
than crashing — visible on Overview, Settings and `GET /api/health`.

### 4. Migrations and seed

```bash
npm run prisma:migrate     # development: creates/applies migrations
npm run seed               # optional demo data, safe to re-run
```

The seed creates two deliberately unrelated campaigns — AI automation for German
manufacturers, and club anthems for Slovak sports clubs — so you can see the same
pipeline serving completely different briefs. Every seeded row is marked
`isDemo`, every domain is under the reserved `.example` TLD (RFC 2606) so it can
never resolve to a real company, every seeded address is `UNKNOWN` (below the send
threshold), and both campaigns are `DRAFT` / `DRAFT_ONLY`, so **nothing can be sent
from seeded data**.

### 5. Run it

```bash
npm run dev                # http://localhost:3100
npm run worker             # in a second terminal: processes the job queue
```

## SMTP and IMAP (Websupport or any provider)

The default configuration targets a Websupport mailbox, but the settings are
generic. For Websupport:

```ini
SMTP_HOST=smtp.m.websupport.sk
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@yourdomain.tld
SMTP_PASSWORD=your-mailbox-password
SMTP_FROM_NAME=Your Name
SMTP_FROM_EMAIL=you@yourdomain.tld

IMAP_HOST=imap.m.websupport.sk
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=you@yourdomain.tld
IMAP_PASSWORD=your-mailbox-password
IMAP_MAILBOX=INBOX
```

Check both from **Settings → Connection tests** before activating a campaign;
`verifyConnection()` authenticates without sending anything.

Reply detection needs the replies to land in `IMAP_MAILBOX`. If a server-side filter
moves them elsewhere, point `IMAP_MAILBOX` at that folder. Sending authenticates as
`SMTP_USER`, so `SMTP_FROM_EMAIL` must be an address that mailbox may send from, or
the provider will reject the message. Set up SPF, DKIM and DMARC for the domain
before any volume sending.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string. |
| `LLM_PROVIDER` | `ollama` | `ollama` or `openai-compatible`. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama. |
| `OLLAMA_MODEL` | — | Model tag. Never hardcoded; overridable in Settings. |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | — | For an OpenAI-compatible endpoint. |
| `LLM_TIMEOUT_SECONDS` | `180` | Per-call timeout. |
| `SMTP_*` | port `465`, TLS | Outbound mail. |
| `IMAP_*` | port `993`, TLS, `INBOX` | Reply monitoring. |
| `APP_URL` | `http://localhost:3100` | Public URL. |
| `JOB_RUNNER_TOKEN` | — | Shared secret for `/api/jobs/tick` and `/api/imap/sync`. **Set this in production.** |
| `SEARCH_PROVIDER` | `none` | `none`, `serper`, `brave`, `google_cse`. |
| `SEARCH_API_KEY` / `SEARCH_ENGINE_ID` | — | Search credentials. |
| `EMAIL_VERIFICATION_PROVIDER` | `none` | `none`, `hunter`. |
| `ENRICHMENT_PROVIDER` | `none` | `none`, `hunter`. |
| `GLOBAL_DAILY_EMAIL_LIMIT` | `100` | Mailbox-wide cap across all campaigns. |
| `WORKING_HOURS_START` / `_END` | `9` / `17` | Local sending window. |
| `TIMEZONE` | `Europe/Bratislava` | IANA zone for the window and daily counters. |
| `SEND_MIN_GAP_MINUTES` / `_MAX_` | `4` / `14` | Randomised gap between sends. |
| `CRAWLER_USER_AGENT` | `SalesAgentBot/0.1` | Identify yourself honestly. |
| `CRAWLER_TIMEOUT_SECONDS` | `20` | Per-page fetch timeout. |
| `CRAWLER_MAX_PAGES_PER_COMPANY` | `6` | Research budget per company. |

Anything in **Settings** (provider, model, sender identity, limits, working hours,
timezone, send gaps, trust threshold) is stored in the database and overrides the
`.env` default at runtime. **Credentials are never stored in the database** and are
never editable from the UI — they stay in the environment only.

## Using it

1. **Campaigns → New campaign.** Write the brief in your own words. Set the lead
   target, daily send limit and minimum score.
2. **Review the interpretation.** The agent shows how it understood the brief —
   target, signals, decision makers, exclusions, languages. Correct anything and
   **Save**. Saving marks it reviewed, which is required before any sending.
3. **Rebuild the search strategy** if you want to see or change the queries.
4. **Run discovery**, then let the worker process the queue (or press **Run queue**).
5. **Inspect leads.** Each lead detail page has a *Why this lead* section where
   every reason carries its source link, plus the qualification reasoning, the
   recommended angle, the contact, the generated email and a full timeline.
6. **Still in `DRAFT_ONLY`:** read the drafts. Send individual ones with **Send now**
   if you like what you see.
7. **Enable automatic sending** when you trust the output. Drafts are then sent
   gradually inside your working hours.
8. **Inbox** shows replies beside the original email. Nothing is auto-answered;
   reply from your own mail client.

## How providers work

Five interfaces, each with a null implementation that **refuses rather than
inventing results**:

| Interface | Implementations | Null behaviour |
| --- | --- | --- |
| `LLMProvider` | Ollama, OpenAI-compatible | Reports what is missing |
| `SearchProvider` | Serper, Brave, Google CSE | Discovery finds nothing and says why |
| `EmailVerificationProvider` | Hunter | Syntax only; addresses stay `UNKNOWN` |
| `ContactEnrichmentProvider` | Hunter | Contacts come only from the company's own pages |
| `EmailProvider` | SMTP | Sending is blocked by pre-send validation |

Adding Apollo, Anthropic, Mistral, OpenRouter, a job board, a company register or
another enrichment source means writing one class and adding one `case` to that
provider's factory. No call site changes.

The null verification provider can mark an address `INVALID` but can never promote
one to `VERIFIED` — which is what keeps "verified" meaningful at send time.

## The job runner

A single `Job` table with an idempotency key and claim-by-conditional-update
locking, so several workers can run concurrently and no job is processed twice.
Jobs retry with exponential backoff up to `maxAttempts`, then fail with the error
recorded.

Types: `CAMPAIGN_DISCOVERY`, `COMPANY_RESEARCH`, `LEAD_QUALIFICATION`,
`CONTACT_DISCOVERY`, `EMAIL_GENERATION`, `EMAIL_SEND`, `IMAP_SYNC`.

Three ways to drive it:

```bash
npm run worker                                    # long-running process

curl -X POST "$APP_URL/api/jobs/tick?max=10" \    # cron / Vercel Cron / systemd
  -H "Authorization: Bearer $JOB_RUNNER_TOKEN"

# or press "Run queue" in the dashboard
```

Moving to BullMQ later means replacing `enqueueJob` and `claimNextJob` — the
handlers do not change.

## Rate limiting and scheduling

Per-campaign daily limit, plus a mailbox-wide limit across all campaigns, both
counted from local midnight in your configured timezone (DST-correct and valid for
half-hour-offset zones). `scheduleSends` spreads the remaining allowance across
what is left of today's working window with a randomised 4–14 minute gap — never
30 messages at 09:00 — and never schedules past the end of the window; the next
tick picks up where it left off. Weekends are skipped.

## Verifying an installation

```bash
npm run typecheck      # strict TypeScript, no implicit any
npm run build          # production build
npm run selfcheck      # 35 assertions against your live database
```

`selfcheck` creates throwaway rows under the reserved `.invalid` TLD, asserts that
every guard independently blocks a send, that deduplication and the reply stop work,
that fabricated source URLs and placeholder text are rejected, that the queue is
idempotent, and that day boundaries are correct in several timezones — then deletes
everything it made. It never sends an email.

## Production deployment

1. Provision PostgreSQL and run `npm run prisma:deploy` (not `migrate dev`).
2. Set `JOB_RUNNER_TOKEN` to a long random value. Without it, `/api/jobs/tick` and
   `/api/imap/sync` are unauthenticated.
3. Set `APP_URL` to the public URL.
4. `npm run build && npm run start`, behind TLS.
5. Run the worker as a supervised service, or schedule the endpoints:

   ```
   */2 * * * * curl -fsS -X POST "$APP_URL/api/jobs/tick?max=10" -H "Authorization: Bearer $TOKEN"
   */5 * * * * curl -fsS -X POST "$APP_URL/api/imap/sync"       -H "Authorization: Bearer $TOKEN"
   ```

6. **Put the app behind authentication.** It ships without a login (see
   [limitations](#current-limitations)) — use your platform's access control, a
   reverse-proxy auth layer, or a private network.
7. Monitor `GET /api/health`.

On serverless platforms prefer the cron endpoints over the long-running worker, and
keep `max` low enough to finish inside the function timeout. IMAP and SMTP need
outbound TCP on 993/465, which some serverless environments restrict.

## Security notes

- **Credentials never reach the model.** SMTP and IMAP passwords and all API keys
  are read from the environment inside their provider modules. No prompt-building
  code can see them, and `env.ts` is server-only.
- **Credentials are never stored in the database** and are not editable from the UI.
  `GET /api/health` reports only *whether* something is configured.
- **No secrets in the browser.** No `NEXT_PUBLIC_*` variable exists; every mutation
  is a server action.
- **Model output is never trusted.** Zod validates every response. Email addresses
  are cross-checked against the source material and discarded if absent. Evidence
  URLs are checked against pages actually fetched. Content checks run again on the
  stored draft at send time, in case it was edited.
- **The crawler is polite:** http(s) only, `text/html` only, size-capped,
  time-capped, page-count-capped per company, and identifies itself via
  `CRAWLER_USER_AGENT`.
- **Role mailboxes are never contacted** — `noreply@`, `abuse@`, `postmaster@`,
  `privacy@`, `dpo@`, `gdpr@` and similar are rejected before any send.
- **Compliance is yours.** This tool sends unsolicited B2B email. GDPR, ePrivacy,
  CAN-SPAM and local rules differ by jurisdiction and by recipient type. Keep the
  suppression list authoritative, honour opt-outs immediately, send from a domain
  you control with SPF/DKIM/DMARC configured, and get your own legal advice for the
  markets you target. The agent gives you the audit trail; it does not give you a
  legal basis.

## Project layout

Fifteen Prisma models: `User`, `AppSettings`, `Campaign`, `SearchStrategy`,
`Company`, `Lead`, `LeadStatusHistory`, `LeadEvidence`, `Contact`, `EmailDraft`,
`SentEmail`, `InboundEmail`, `SuppressionEntry`, `AgentRun`, `Job`, `AgentLog`.

Indexed on `domain`, contact `email`, `campaignId`, `status`, `score`, `sentAt`,
`createdAt`, `repliedAt` and the queue's `(status, runAfter)`. Uniqueness is enforced
where it matters: one lead per company per campaign, one contact per address, one
`SentEmail` per `Message-ID`, one suppression entry per scope+value.

Lead statuses: `DISCOVERED`, `RESEARCHING`, `QUALIFIED`, `REJECTED`,
`CONTACT_FOUND`, `READY`, `DRAFTED`, `SENT`, `REPLIED`, `MANUAL`, `FAILED`,
`DO_NOT_CONTACT` — every transition recorded in `LeadStatusHistory`.

## Current limitations

Honest about what this MVP is not:

- **No authentication.** Single implicit operator; put it behind access control.
- **Discovery needs a search provider.** With `SEARCH_PROVIDER=none` the pipeline
  runs but finds nothing, by design.
- **Reply classification is minimal.** Replies are detected and automation stops;
  they are not sorted into positive/negative. The Overview has a slot for that.
- **No `robots.txt` parsing yet.** The crawler is rate-limited, capped and
  self-identifying, but does not fetch `robots.txt`.
- **Research reads HTML only.** No JavaScript rendering, no PDFs.
- **Deliverability is not managed.** No warm-up ramp, no bounce processing beyond
  the suppression list, no engagement tracking.
- **One mailbox.** No rotation across senders.
