# Composer prompt — wire Car Detailer to Neon + Netlify + GitHub

> Paste everything below into Cursor Composer. It already reflects the app's real
> data model and roles, so don't re-derive them — implement against this spec.

---

## Goal

The current `index.html` is a front-end-only prototype: all state lives in
`localStorage`. Turn it into a real multi-user web app backed by **Neon (Postgres)**,
served on **Netlify** with **Netlify Functions** as the API layer, with the source in
**GitHub** and auto-deploy on push.

Do **not** change the existing UI/UX or workflow. Keep the same screens, roles, and
buttons. Only replace the data layer (localStorage → API calls) and add the backend.

## Hard constraints

- The browser must **never** connect to Postgres directly. All DB access goes through
  Netlify Functions. No DB credentials in client code.
- Use the **Neon serverless driver** (`@neondatabase/serverless`) and Neon's **pooled**
  connection string (the `...-pooler...` host). Serverless functions exhaust direct
  connections otherwise — this is the usual cause of intermittent "server error".
- Read the connection string from a `DATABASE_URL` environment variable. Never commit it.
  Add `.env`, `.env.*`, and `node_modules` to `.gitignore`.
- Every function must return JSON and a proper HTTP status, and must `try/catch` so the
  client receives a readable error message, not an opaque 500. Log the real error
  server-side via `console.error`.

## Data model (build the schema from this)

Three entities. Users-to-branches is many-to-many.

**branches**: `id` (PK), `name` (text, not null), `created_at` (timestamptz default now()).

**users**: `id` (PK), `username` (text, unique, not null), `password_hash` (text, not null),
`full_name` (text), `role` (text, check in `'admin'|'cs'|'detailer'`), `is_active`
(bool default true), `created_at` (timestamptz default now()).
> Replace the prototype's plaintext passwords with **bcrypt hashes** (`bcryptjs`).
> Seed one admin (`admin`/`admin`) hashed on first run.

**user_branches** (join): `user_id` (FK→users, cascade), `branch_id` (FK→branches, cascade),
primary key `(user_id, branch_id)`. Admins may have zero rows (they see all branches).

**jobs**: `id` (PK), `rego` (text, not null), `branch_id` (FK→branches), `acriss_group`
(text), `fuel_eighths` (int), `mileage` (int), `service_type` (text),
`status` (text, check in `'awaiting_wash'|'in_progress'|'done'`, default `'awaiting_wash'`),
`intake_by` (FK→users), `detailer_id` (FK→users, nullable), `notes` (text),
`after_notes` (text), `returned_at` (timestamptz), `started_at` (timestamptz),
`finished_at` (timestamptz), `sort_order` (int), `created_at` (timestamptz default now()).

Provide the schema as a committed SQL migration file (`db/schema.sql`) plus a short
`db/seed.sql` (or a seed function) for the demo branches and admin user.

## API (Netlify Functions, under `/.netlify/functions/` or `/api/*` redirects)

Implement these. Enforce role/branch rules server-side, not just in the UI.

- `POST /auth/login` — `{username, password}` → verify bcrypt, return a session token
  (signed JWT is fine; secret in `JWT_SECRET` env var) + the user record (no hash).
- `GET /me` — current user from token.
- `GET /branches` — list. `POST /branches` (admin), `PATCH /branches/:id` (admin rename),
  `DELETE /branches/:id` (admin; reject if it has jobs).
- `GET /users` (admin) — list. `POST /users` (admin) — create with branches + hashed pw.
  `PATCH /users/:id` (admin) — role, is_active, branch assignments.
- `GET /jobs?branch_id=&status=` — list, scoped to the caller's allowed branches
  (admin = all). `POST /jobs` — check-in (cs/admin), sets `returned_at`, `sort_order`.
- `POST /jobs/:id/claim` — **start clean** (detailer assigned to that branch): set
  `status='in_progress'`, `detailer_id`=caller, `started_at=now()`, optional notes.
  Reject if job isn't `awaiting_wash` or caller lacks the branch → return 409/403 with a
  clear message.
- `POST /jobs/:id/finish` — set `status='done'`, `finished_at=now()`, `after_notes`.
- `POST /jobs/:id/reorder` — `{direction}` swap `sort_order` with neighbor (admin).

## Front-end changes

- Add a small `api.js` client: a `request(path, opts)` helper that attaches the auth
  token, parses JSON, and **throws with the server's error message** so the UI can show it.
- Replace every `localStorage` data read/write for branches, users, jobs, and session
  with the corresponding API call. Keep using localStorage only to cache the auth token.
- Keep the existing render functions; just feed them data from the API instead of the
  in-memory arrays. Since calls are now async, make the render/handlers `async` and show a
  brief loading/error state instead of silently failing.
- Surface API errors inline (there are already `.error` slots in the UI) rather than
  letting an exception bubble up as a generic failure.

## Repo, deploy, config

1. Add `package.json` with deps: `@neondatabase/serverless`, `bcryptjs`, `jsonwebtoken`.
   Add a `netlify.toml` (functions dir, redirects mapping `/api/*` → functions, publish dir).
2. `.gitignore`: `node_modules`, `.env*`, build artifacts.
3. Initialize git, commit, and push to a new GitHub repo (ask me for the repo name/URL, or
   give me the exact `git`/`gh` commands to run).
4. Document required Netlify env vars in `README.md`: `DATABASE_URL` (Neon pooled),
   `JWT_SECRET`. Explain connecting the repo to Netlify and that env vars are set in the
   Netlify dashboard, not committed.
5. Provide the exact steps to create the Neon project, run `db/schema.sql`, and seed.

## Acceptance criteria

- Fresh clone + `DATABASE_URL`/`JWT_SECRET` set + schema applied → app runs on Netlify.
- A detailer can log in and click **Start clean** with **no server error**; the job moves
  to In Progress and persists across reloads and across different browsers/devices.
- CS check-ins, finish-clean, history filters, and admin user/branch management all work
  against Postgres.
- No secrets in the repo; `git status` is clean after deploy.

## Note on the current bug

The live "server error on start detailing" almost certainly originates in the
function/DB layer — most likely a missing `DATABASE_URL` in Netlify, a non-pooled Neon
connection string, or a schema/column mismatch on the claim query. Before rewriting,
check the Netlify **Functions logs** for the actual stack trace and make the claim
endpoint above return that error clearly.
