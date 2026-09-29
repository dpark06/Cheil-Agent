# Known Gaps and Next Steps for Production

This build implements the full core product loop end-to-end and runs standalone, with no cloud
storage account, enterprise identity provider, or hosting account provisioned. Everything below is
either a deliberate scope decision (confirmed with the product owner) or a gap that requires
accounts/credentials this environment doesn't have. Each item names what a real launch needs.

## Deliberate scope decisions

**Deck branding uses a custom font by name only, not an embedded font file.** `src/lib/deck/brand-theme.ts`
sets `fontFace: "SamsungSS Head"` / `"SamsungSS Body"` per the provided internal brand guideline
excerpt (Color + Typography sections only — no logo or spacing/grid pages were in that excerpt, so
no logo is placed in generated decks). PowerPoint doesn't embed these fonts; it silently falls back
to a default font on any machine that doesn't have "SamsungSS" installed. If pixel-perfect brand
typography matters, embed the actual font files in the `.pptx` or ship them with the viewing
environment.

**No cloud storage provider (SharePoint/OneDrive/Google Drive/Box).** Users upload files directly
through the browser and download the generated deck directly — there's no "save back to shared
folder" step. To add one: implement a `StorageAdapter`-equivalent OAuth flow per provider (see
`src/lib/storage/storage-adapter.ts` for the interface shape to extend) and a picker UI.

**AI provider defaults to a mock.** `AI_PROVIDER=mock` (default) runs the entire app with zero API
calls, using deterministic canned-but-context-aware output (see `src/lib/ai/providers/mock-provider.ts`
and each stage's `mockFallback`). The mock has no real image understanding at all — for `IMAGE`-type
changes it only ever describes a bounding box's on-page position (e.g. "the top-left area"), never
actual visual content. `AI_PROVIDER=openai` (`src/lib/ai/providers/openai-provider.ts`) and
`AI_PROVIDER=anthropic` (`src/lib/ai/providers/anthropic-provider.ts`, using Claude's vision API via
forced tool-use for structured output) are both real, working, paid implementations — set `AI_API_KEY`
and `AI_MODEL` to use either. Neither has been exercised against a live API key in this environment;
both were verified via `tsc --noEmit`/`next build` and by confirming they throw a clear error when
`AI_API_KEY` is missing, matching the existing OpenAI provider's pattern.

`AI_PROVIDER=ollama` (`src/lib/ai/providers/ollama-provider.ts`) runs against a local Ollama instance
instead — no API key, no per-call billing — using Ollama's `format` JSON-schema param for structured
output (Ollama has neither OpenAI's `json_schema` mode nor Claude's tool-forcing). This one **has**
been exercised end-to-end in this environment (local Ollama 0.32.14, model `llava:latest`, on an
Apple M4 Max / 48GB Mac — comfortably enough hardware for a 7B Q4 model) by running the real
`runAiPipeline` production path against an existing comparison. Findings from that run:
- It genuinely works: real HTTP calls to `localhost:11434`, real varying (non-canned) output,
  correctly identified an `IMAGE` change's actual on-screen content (a UI element with a text label)
  and its removal between versions — the thing mock mode structurally cannot do.
- Ollama's `format` schema does not enforce numeric `minimum`/`maximum` — llava returned
  `"confidence": 100` for a field documented as 0-1. `ollama-provider.ts` renormalizes any
  `confidence` field found at 1-100 back to a 0-1 fraction before schema validation, since this was
  a reliably reproducible failure mode, not a one-off.
- llava's default generation length truncated longer structured-output fields mid-sentence (an
  `observedDifference` cut off after two words). Fixed by setting `options.num_predict: -1`
  (uncapped, bounded only by context length) in the request.
- Even after both fixes, **output reliability is noticeably below the paid providers**: re-running
  the identical pipeline against the identical stored image crop (no diff/upload changed between
  runs) produced two substantially different content descriptions of the same image — llava is a
  small (7B), heavily quantized (Q4_0) vision model and is not consistent run-to-run. Treat
  `AI_PROVIDER=ollama` as viable for a free/offline prototype demo, not as a quality bar to judge
  the feature by — `openai`/`anthropic` remain the higher-fidelity options.

**`AI_PROVIDER=fallback`** (`src/lib/ai/providers/fallback-provider.ts`) chains multiple providers
and uses the first one that actually responds — e.g. `AI_FALLBACK_ORDER=anthropic,openai` tries
Claude first and only calls OpenAI if Claude's API call itself throws (down, rate-limited, auth
error). This is availability failover, not a per-call quality comparison — only one provider is
ever billed per call, whichever succeeds first — and it does not protect against a provider that
responds but produces bad output (that's what the schema-validation retry loop in `run-stage.ts`
is for, a separate concern). Each provider in the chain needs its own key/model
(`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, `OPENAI_API_KEY`/`OPENAI_MODEL`) rather than the generic
`AI_API_KEY`/`AI_MODEL`, since both need to be independently usable. Verified with a scripted test
(primary throws, secondary succeeds → fallback result returned; both throw → clear aggregated
error) but not yet exercised against two real, simultaneously-live API keys.

For `IMAGE`-type changes, the Change Explainer stage (`src/lib/ai/stages/02-change-explainer.ts`) now
sends the vision model **both** the previous-version and new-version crop of the changed region (via
`src/lib/ai/tools/get_image_crop.ts`), explicitly labeled, with an instruction to identify what's
actually depicted in each before describing the difference. Previously it only ever sent the new
version's crop — real subject-matter changes (an element present in one version and gone in the
other, not just moved/recolored/resized) were structurally invisible to the AI even with a real
vision-capable provider configured, since it never saw the "before" image at all.

**PDF/PNG/JPEG input only — no native PPTX/DOCX upload.** The diff pipeline renders PDF pages;
supporting native PPTX/DOCX input would require a conversion step (e.g. LibreOffice headless)
that isn't installed here. Users export source decks to PDF first.

**Email/password auth, no enterprise SSO.** Real, working auth via Auth.js Credentials + bcrypt
(`src/lib/auth.ts`), single-tenant (no org/tenant hierarchy — first registered user becomes
`ADMIN`). Production needs an actual identity provider (Microsoft Entra ID / Google Workspace) —
the Prisma adapter is already wired so adding an OAuth provider later doesn't require restructuring
auth, but Credentials + adapter together force JWT sessions (see the comment in `src/lib/auth.ts`).

**Email provider defaults to console-log.** `EMAIL_PROVIDER=console` (default) doesn't send real
email — password-reset links are logged to the server console instead (see
`src/lib/email/providers/console-provider.ts`). This is the only email flow in the app right now
(forgot/reset password, `src/app/(auth)/forgot-password`, `src/app/(auth)/reset-password`).
`EMAIL_PROVIDER=smtp` is a real, working implementation (`src/lib/email/providers/smtp-provider.ts`)
via `nodemailer` — set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` to send real
mail. It hasn't been exercised against a live SMTP account in this environment. Reset tokens are
single-use, expire after 1 hour, and the request endpoint doesn't reveal whether an email is
registered (rate-limited per-email via `assertUnderKeyedRateLimit`, 5/hour).

## Gaps that need real accounts/infrastructure

**Malware scanning is heuristic only.** `src/lib/security/malware-heuristic.ts` cross-checks file
extension, declared MIME type, and magic bytes — it is *not* a real antivirus/malware scanner.
Integrate ClamAV (via `clamd`) or a cloud scanning API before any production launch; the function
signature is already isolated to make that a contained swap.

**Encryption at rest is app-layer only, and optional.** If `ENCRYPTION_KEY` is unset, uploaded
files are stored unencrypted on local disk (the app logs a warning at startup). If set, files are
encrypted with AES-256-GCM in `LocalStorageAdapter` — but this is not a substitute for disk-level
encryption, KMS-backed key management, or key rotation in a real deployment.

**Serverless deployment (Vercel + free Postgres) exists as a second, parallel deploy path.**
The original design assumes a platform that can run `worker.ts` as a genuine long-running process
(Railway, Render, Fly.io, a VPS) — that remains the more robust option and needs no code changes
beyond what's already here. But those platforms now require a payment method on file even for
free-tier usage, which isn't always acceptable for a portfolio/demo deployment. So there's now a
second path with **zero payment method required anywhere**: Vercel (web app, free Hobby tier) +
Supabase or Neon (Postgres, free tier) + this repo's own GitHub Actions cron
(`.github/workflows/process-jobs-cron.yml`, free, no card).

This works by *not* relying on a persistent worker process at all. graphile-worker's `runOnce()`
(processes everything currently queued, then returns — as opposed to `worker.ts`'s `run()`, which
polls forever) is called two ways: immediately, via Next.js's `after()`, right after a job is
enqueued (`src/lib/jobs/queue.ts`) — so on a serverless deploy, work starts right away instead of
waiting for a cron tick, keeping the live progress-bar UX intact — and periodically, by GitHub
Actions hitting `/api/cron/process-jobs` (protected by `CRON_SECRET`, constant-time compared) as a
catch-up sweep in case the immediate trigger gets killed mid-run. `worker.ts` is completely
unaffected either way and remains the primary path for local dev and for any platform that can run
it continuously.

**The real constraint this introduces: serverless function time limits.** Vercel's free Hobby plan
caps functions at 60 seconds regardless of what `maxDuration` a route declares (Pro allows up to
300s). A comparison with several changes run through a *real* (non-mock) AI provider can take
longer than that per stage, especially chained across all 4 pipeline stages — a call that gets cut
off mid-run leaves its job locked until graphile-worker's stale-lock timeout passes, which can take
a while. `AI_PROVIDER=mock` sidesteps this entirely (each mock call is near-instant) and is the
practical default for this deploy path; a real provider works but is meaningfully more likely to
time out on Hobby-tier limits than it would running continuously on Railway/Render/Fly.io.

**File storage is still local disk** (`LocalStorageAdapter`), and Vercel's serverless filesystem is
ephemeral — uploaded files and generated decks will not persist reliably across deploys/cold starts
on this path. Fine for a live click-through demo; not fine as a real multi-user deployment. Swapping
in real object storage (S3-compatible; Supabase itself offers this) is the fix, not yet built.

Verified locally by killing the local worker process entirely, uploading a comparison through the
real API, and confirming it reached `READY_FOR_REVIEW` purely via the `after()`-triggered sweep —
and separately confirming `/api/cron/process-jobs` rejects a missing/wrong secret (401) and
succeeds with the correct one. Not yet verified against an actual Vercel + Supabase/Neon deployment
end-to-end — that's the next real test once deployed.

A real production launch (as opposed to a free demo) still needs: TLS/domain (Vercel provides
this), a payment-method-backed Postgres/hosting tier once free-tier limits are exceeded, and real
object storage regardless of which deploy path is used.

**No legal or compliance documents.** Privacy policy, terms of use, data-processing agreement,
AI-processing disclosure, subprocessor list, and acceptable-use policy do not exist. None of this
is code — it needs a legal review before any real users are onboarded.

**No security review.** Threat model, OAuth scope review, tenant-isolation testing, prompt-injection
testing, and penetration testing have not been performed. `npm audit` has been run and its findings
addressed on an ongoing basis (see the `image-size` entry above for the one currently-unpatched
exception), but that's routine hygiene, not a substitute for an actual security review.

**No brand authorization.** No Cheil/Samsung/Knox branding is used anywhere in this build.

**No formal AI evaluation suite.** There's no curated test dataset with measured
change-detection precision/recall, explanation-accuracy scoring, or unsupported-inference rate —
the diff pipeline and mock AI provider were verified functionally (via `scripts/ci-smoke-test.ts`
and manual end-to-end runs) but not evaluated against a labeled benchmark. Build one before
trusting AI output on real client material.

**No support or incident-response process.** No support contact, on-call rotation, or documented
incident-response runbook exists yet.

## Known code-level limitations

**Background jobs are not retried.** `process-comparison` and `generate-deck`
(`src/lib/jobs/job-limits.ts`) run with `maxAttempts: 1` rather than graphile-worker's default
retry behavior, because the diff/AI pipeline is not idempotent — re-running it after a partial
failure would create duplicate `DetectedChange`/`ExtractedPage` rows or hit unique-constraint
errors on `ExtractedPage`. A production version needs upsert-based, resumable task bodies before
retries are safe to enable.

**Cleanup is time-based, not tied to actual disk pressure.** `cleanup-temp-files`
(`src/lib/jobs/tasks/cleanup-temp-files.ts`) runs every 6 hours and deletes source files/page
renders for comparisons older than `FILE_RETENTION_HOURS`, keeping only the generated `.pptx` and
DB metadata. There's no manual "delete now" admin action yet.

**OpenAI cost estimates are approximate.** `src/lib/ai/providers/openai-provider.ts` uses a
hardcoded, conservatively-rounded per-1K-token price table to enforce
`MAX_AI_COST_CENTS_PER_SESSION` — it is not wired to real-time provider pricing and will drift if
`AI_MODEL` changes. Treat the cap as a safety backstop, not a billing source of truth.

**Rate limiting is basic.** `src/lib/security/rate-limit.ts` counts `AuditEvent` rows per user per
hour (no Redis in this deployment) — there's no IP-based limiting, no burst/sliding-window
handling, and no protection against a compromised account making many small requests within the
hourly window.

**No org/tenant model.** Every user sees only their own comparisons (enforced by `ownerId` checks
in every route), and `ADMIN` can see everything, but there's no concept of a team/organization
boundary, per-org usage limits, or org-level admin settings.

**Dependency versions.** Prisma is pinned at `5.18.0` rather than the latest major (7.x) —
deliberately, to avoid adopting an unfamiliar major version's breaking changes without the ability
to verify them thoroughly in this session. Revisit on a normal upgrade cadence. Most other
dependencies were bumped to current, security-patched versions during this build.

**Known unpatched vulnerability: `image-size` (transitive, via `pptxgenjs`) — high severity DoS.**
`npm audit` currently flags `image-size` (pulled in by `pptxgenjs` for image sizing) for
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) — malformed ICNS/JXL/HEIF
files can hang the parser in an infinite loop. No patched `image-size` release exists yet as of this
writing; the only `npm audit fix` path is a semver-major downgrade of `pptxgenjs` to `1.1.5`, which
would reintroduce other issues this build specifically upgraded past. This app's own upload pipeline
only ever accepts PDF/PNG/JPEG (`src/lib/diff/source-file.ts` rejects everything else), and every
image handed to `pptxgenjs` is a PNG this app rendered itself via `sharp` — not a user-supplied
ICNS/JXL/HEIF file — so the vulnerable code paths aren't reachable through this app's own flows.
Re-check `npm audit` for a real fix before shipping, and reconsider if `pptxgenjs`'s image handling
is ever changed to accept arbitrary user-uploaded image bytes directly.

## What's already real and verified

Everything in the core loop — auth, file upload with at-rest encryption, PDF rendering, text
extraction, OCR fallback, deterministic text/image diffing, the 4-stage AI pipeline with schema
validation and retry-on-invalid-output, the human review/approval gate, deterministic `.pptx`
generation with embedded before/after images, background job processing via graphile-worker, and
status polling — has been exercised end-to-end against a real Postgres database and the real HTTP
API, not just unit-tested in isolation.
