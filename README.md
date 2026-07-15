# EditVideo.io — Channel Audit Report Builder

Handoff brief for Claude Code. Paste this whole file as your first message
in a new Claude Code session (or just let it read `README.md` from the
project root — it does that automatically), then say what you want done.

## What this is

An internal tool for EditVideo.io's team: fill in a client's monthly
YouTube stats, CSV export, screenshots, and analysis notes, and it
generates a branded, print-ready "Channel Audit & Strategy Report" —
matching a specific existing report template (maroon background, bold
rounded cover title, serif client name, dark stat table, narrative-style
analysis pages).

**Audience:** internal team members, not clients directly. They fill in
the form and export/send the resulting report.

## Current state

Right now this is **one single-file HTML app** (`index.html`) built to run
as a Claude.ai artifact. No build step, no backend, no dependencies beyond
two CDN includes. It works today by opening the file directly in a
browser.

### What's already built and working (keep this behavior):
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
  colors, all applied live to the report preview
- **Export** — `window.print()` with print-specific CSS that hides the
  editor and paginates each `.report-page` as one printed page (user picks
  "Save as PDF" in the browser print dialog)
- **Image handling** — uploads are downscaled client-side via canvas
  before being stored, to keep things light

### What needs to change for a real deployment (this is the actual task):

**⚠️ Critical: `window.storage` will not work outside claude.ai.**
The "Save & team access" tab currently calls `window.storage.get/set/
delete/list` — this is a Claude-artifact-only API injected by the claude.ai
runtime. It does not exist in a normal browser or on any standalone host.
That whole block (search for `// NOTE FOR DEPLOYMENT` in `index.html`)
needs to be replaced with a real persistence layer before this ships.

Recommended options, roughly in order of setup effort:
1. **Vercel KV / Upstash Redis** — simplest if deploying to Vercel, minimal
   backend code, good fit for "save/load a handful of client reports by
   key" which is exactly the current data shape.
2. **Supabase** (Postgres + auth) — more setup, but gives you real user
   accounts/auth for free if the team wants login-gated access rather than
   just an unlisted URL.
3. **A tiny custom backend** (e.g. a single Vercel/Netlify serverless
   function backed by a JSON blob store or SQLite/Turso) — fine if you
   want to keep it minimal and don't need accounts.
4. **Skip persistence entirely, ship client-side only** — replace "Save/
   Load" with "Export report data as .json" / "Import .json" buttons.
   Team members save the JSON file themselves (e.g. in a shared Drive
   folder) and re-upload it to keep editing. Zero backend, but no shared
   "list of saved clients" view.

Ask the user which of these fits before picking one — it changes the
project structure a lot (static site vs. site + serverless functions vs.
site + database).

## What NOT to change unless asked

- The visual design (colors, fonts, page layout) — it's intentionally
  matched to an existing report template the team already uses with
  clients. Don't "improve" the aesthetic unprompted.
- The print/export mechanism (`window.print()` + print CSS) — this is
  deliberate; don't replace it with a PDF-generation library unless asked.
- The CSV auto-mapping logic and the "one bullet per line" text convention
  for notables/recommendations/analysis bullets.

## Suggested next steps

1. Ask the user which persistence option (above) they want, and whether
   they need login-gating or just an unlisted/shared URL.
2. Set up a proper project structure (move `index.html` into `public/` or
   keep as root static file, depending on host), `git init`, and a
   `.gitignore`.
3. Replace the `window.storage` block per the chosen option.
4. Deploy (Vercel is the path of least resistance for a static site +
   optional serverless functions — `vercel` CLI, connect a GitHub repo,
   or drag-and-drop deploy).
5. Confirm the exported PDF still looks right after deployment (test
   print-to-PDF in a real browser, not just the artifact preview).
6. If login-gating is wanted: simplest option is Vercel's built-in
   password protection (paid feature) or a lightweight Basic Auth
   middleware; a full auth system (Supabase Auth / Clerk) is the option
   if they want individual team member accounts.

## Files in this handoff

- `index.html` — the full app (single file, ~690 lines: HTML + CSS + JS).
  Fonts loaded from Google Fonts CDN, CSV parsing via PapaParse from
  cdnjs. Both are normal `<link>`/`<script src>` tags and will work fine
  in a standalone deployment — only `window.storage` is the artifact-only
  piece.
- `README.md` — this file.
