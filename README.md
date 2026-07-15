# EditVideo.io — Channel Audit Report Builder

An internal tool for EditVideo.io's team: fill in a client's monthly
YouTube stats, CSV export, screenshots, and analysis notes, and it
generates a branded, print-ready "Channel Audit & Strategy Report" —
matching a specific existing report template (deep indigo background,
bold rounded cover title, serif client name, dark stat table,
narrative-style analysis pages).

**Audience:** internal team members, not clients directly. They fill in
the form and export/send the resulting report.

## Current state

Static HTML app (`index.html`) + one Vercel serverless function
(`api/ai-assist.js`). No build step, no database, no user accounts.

### What's built and working:
- **Cover page** — agency name/logo, year/period, report title, client name
- **Executive summary** — free-text narrative, centered
- **Top videos table** — CSV import (via PapaParse, auto-maps common
  YouTube Analytics column names: views, watch time, subscribers,
  impressions, CTR, etc.) plus manual row add/edit/remove, sorted by views,
  shows top N (configurable)
- **Notables & recommendations** — bullet lists with an auto-bold
  "Label: detail" convention, numbered recommendations list
- **Deep-dive analysis sections** — repeatable blocks (pre-seeded with
  "Thumbnail & Visual Branding Audit" and "SEO & Metadata Audit," more can
  be added in the UI). Each section auto-generates: an intro page (with
  optional reference images), a "What's Working" page, a "What Needs
  Improvement" page, and an "Actionable Next Steps" page — only rendering
  pages that have content.
- **Branding tab** — agency name, logo upload, background/text/table
  colors, all applied live to the report preview. Defaults are sampled
  from editvideo.io's real brand palette (deep indigo `#1B0E3D` /
  off-white `#F4F1FA` / near-black-indigo table `#120A28`) but are fully
  overridable per report — see "Theme colors" below.
- **Export** — `window.print()` with print-specific CSS that hides the
  editor and paginates each `.report-page` as one printed page (user picks
  "Save as PDF" in the browser print dialog)
- **Image handling** — uploads are downscaled client-side via canvas
  before being stored, to keep things light
- **Save & team access** — no login, no server-side storage. "Export
  report as .json" downloads the current report; "Import .json" loads one
  back in (here or on a teammate's machine). Share the file via
  Drive/Dropbox/Slack — whatever the team already uses.
- **AI assist** (Gemini, server-side) — see below.

## Theme colors

The report's default colors (`state.branding.bg` / `.text` / `.tableBg`)
are plain hex strings set once in the JS `state` object and mirrored in
the three color pickers on the Branding tab — there's no separate "theme
variable" file to edit. To change the default palette permanently, update
the three hex values in `index.html`:
- `state.branding` initializer (search for `branding:{`)
- the three `<input type="color" ...>` defaults on the Branding panel
- the three fallback values in `hydrateForm()`

Anyone using the app can override colors per-report from the Branding tab
without touching code — those overrides live in the exported `.json` file,
not in `index.html`.

## AI assist

Three lightweight AI-assist features, all backed by a single serverless
function (`api/ai-assist.js`) that calls the **Gemini API** server-side.
The API key never reaches the browser.

- **✨ Suggest recommendations** (Notables & recs tab) — sends the
  summary, video metrics, and notables to Gemini, gets back 3–5 draft
  recommendations in the same "Label: detail" convention as the rest of
  the report. Each draft is editable and individually checkable before
  you add the selected ones to the Recommendations field.
- **✨ Improve this summary** (Exec summary tab) — sends the current
  draft to Gemini for a tightened rewrite (same facts/numbers, tighter
  prose). Shown as an editable preview with "Use this version" /
  "Discard" — never overwrites your draft silently.
- **🔎 What am I missing?** (top bar) — runs an instant local check for
  empty/thin sections (no videos, no recs, empty analysis sections, etc.)
  and, in parallel, asks Gemini to flag weak or generic content (a
  summary with no concrete numbers, recommendations that are too vague).
  Both sets of flags show in one list. Purely advisory — never blocks
  export.

Model used: `gemini-flash-latest` by default — a rolling alias to whatever
Google's current GA flash model is, chosen specifically so this doesn't
break every time Google deprecates a dated model (which has been
happening every few months). Override via the `GEMINI_MODEL` env var if
you want to pin a specific dated model, or try `gemini-flash-lite-latest`
if you hit the free tier's rate limit often (it has a higher free-tier
cap). The function retries on `429`/`503` with exponential backoff (up to
4 retries) since the Gemini free tier caps around 15 requests/minute.

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket) and import it in the
   [Vercel dashboard](https://vercel.com/new), or run `vercel` from the
   repo root with the Vercel CLI. No framework preset needed — it's a
   static `index.html` at the repo root plus one file in `api/`, which
   Vercel picks up automatically as a serverless function.
2. **Add the Gemini API key.** In the Vercel dashboard: open the project
   → **Settings** → **Environment Variables** → add a new variable:
   - Key: `GEMINI_API_KEY`
   - Value: your key from [Google AI Studio](https://aistudio.google.com/apikey)
     (free tier is fine)
   - Environment: check all three (Production, Preview, Development)
   - Save, then **redeploy** (env var changes don't apply to already-built
     deployments) — Deployments tab → "..." on the latest deployment →
     Redeploy.
   Optionally also add `GEMINI_MODEL` the same way if you want to pin a
   specific dated model instead of the `gemini-flash-latest` default.
3. That's it — no database, no other config. Share the resulting
   `*.vercel.app` URL (or a custom domain, if you attach one in Settings →
   Domains) with the team.

### Local development

```
npm install -g vercel   # once, if you don't have it
vercel dev
```

Copy `.env.example` to `.env.local` and fill in `GEMINI_API_KEY` first, so
the AI-assist endpoints work locally too — `vercel dev` reads
`.env.local` automatically.

### Login-gating (optional, not set up)

There's no auth. If you want to restrict the URL to the team instead of
relying on it being unlisted, the simplest option is Vercel's built-in
[password protection](https://vercel.com/docs/deployment-protection)
(paid feature on some plans) — no code changes needed. A full accounts
system (Supabase Auth / Clerk) would be a bigger addition; ask if that's
wanted.

## What NOT to change unless asked

- The visual design (fonts, page layout, print pagination) — it's
  intentionally matched to an existing report template the team already
  uses with clients. Don't "improve" the aesthetic unprompted.
- The print/export mechanism (`window.print()` + print CSS) — this is
  deliberate; don't replace it with a PDF-generation library unless asked.
- The CSV auto-mapping logic and the "one bullet per line" text convention
  for notables/recommendations/analysis bullets.

## Files

- `index.html` — the full app (HTML + CSS + JS, single file). Fonts from
  Google Fonts CDN, CSV parsing via PapaParse from cdnjs.
- `api/ai-assist.js` — Vercel serverless function; calls Gemini
  server-side for the three AI-assist features above.
- `vercel.json` — sets a 30s timeout on the AI-assist function (covers
  the worst-case retry/backoff chain).
- `.env.example` — copy to `.env.local` for local dev.
- `package.json` — no runtime dependencies; the serverless function uses
  Node's built-in `fetch`.
