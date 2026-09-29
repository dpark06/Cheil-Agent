# Cheil Delta

Cheil Delta compares two versions of a creative/marketing file (PDF or image), detects what
changed using deterministic diffing, has an AI pipeline explain the changes in plain language,
and — after a human reviews and confirms every change — generates a PowerPoint review deck.

The AI never generates the presentation directly, never invents changes on its own, and never
gets treated as approved until a human confirms it. See [docs/known-gaps.md](docs/known-gaps.md)
for what's simplified in this build versus a full enterprise deployment, and why.

## How it works

```
Upload previous + new file (browser)
      -> Deterministic diff pipeline (PDF render, text extract, OCR fallback, text/image diff)
      -> AI pipeline: Classifier -> Explainer -> Relationship Mapper (stages 1-3, automatic)
      -> Human review: confirm / edit / reject / mark minor every detected change
      -> AI pipeline: Review-Deck Planner (stage 4, only runs post-approval)
      -> Deterministic .pptx generation
      -> Download
```

All of the above (diffing + all 4 AI stages + deck generation) runs as background jobs via
graphile-worker, with the UI polling for status.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (local via Docker, or any reachable instance)

## Setup

```bash
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — defaults to the docker-compose Postgres below
- `AUTH_SECRET` — generate with `npx auth secret`
- `ENCRYPTION_KEY` — generate with `openssl rand -hex 32` (optional but recommended; without it, uploaded files are stored unencrypted at rest)
- `AI_PROVIDER=mock` to run fully offline with no API key, `AI_PROVIDER=openai` / `AI_PROVIDER=anthropic` + `AI_API_KEY` for real paid AI calls, or `AI_PROVIDER=ollama` for a free local model (requires `ollama serve` running and a vision model pulled, e.g. `ollama pull llava`; no key needed). Mock has no real image understanding — use one of the other three if you need the AI to actually interpret image content (e.g. to catch a visual element that's present in one version and missing in the other, not just moved or recolored). Of the three, `ollama` is free but noticeably less reliable — see [docs/known-gaps.md](docs/known-gaps.md) for specifics

Start Postgres:

```bash
docker compose up -d
```

Install dependencies and set up the database:

```bash
npm install
npm run db:migrate
```

Run the app and the background worker (two processes):

```bash
npm run dev      # Next.js app on http://localhost:3000
npm run worker   # graphile-worker — required for uploads to actually process
```

Register the first account at `/register` — it's automatically granted the `ADMIN` role.

## Project structure

- `src/app/` — Next.js App Router pages and API routes
- `src/lib/diff/` — deterministic PDF rendering, text extraction, OCR fallback, text/image diffing
- `src/lib/ai/` — the 4-stage AI pipeline: schemas (`schemas/`), stage implementations (`stages/`),
  the orchestrator (`pipeline-orchestrator.ts`), the provider abstraction (`provider.ts`,
  `providers/`), and the scoped, read-only context-building functions in `tools/`
- `src/lib/deck/` — deterministic `.pptx` generation from the AI's approved slide plan
- `src/lib/jobs/` — graphile-worker task definitions and the worker entry point
- `src/lib/storage/` — local-disk storage adapter with optional AES-256-GCM encryption at rest
- `prisma/schema.prisma` — full data model

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run worker` | Start the background job worker (required — uploads won't process without it) |
| `npm run build` / `npm start` | Production build and start |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed:fixtures` | Generate two small fixture PDFs into `fixtures/` for manual testing |

## Testing the whole flow locally

```bash
npm run seed:fixtures
```

Then, signed in, create a new comparison and upload `fixtures/previous.pdf` as the previous
version and `fixtures/next.pdf` as the new version. With `AI_PROVIDER=mock` (the default) this
requires no API key and produces deterministic, context-aware fake explanations — real text and
image diffs, fake AI judgment — so the whole pipeline is testable offline.

## Known gaps

This is a from-scratch build made to run standalone (no cloud storage account, no enterprise SSO,
no provisioned hosting). See [docs/known-gaps.md](docs/known-gaps.md) for the full list of what's
simplified versus a full production deployment, and what a real launch still needs.
