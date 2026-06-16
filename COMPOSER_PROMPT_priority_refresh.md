# Composer prompt — wash-queue priority + calmer auto-refresh

> Paste into Cursor Composer. Two features for the Car Detailer app (Neon + Netlify
> Functions backend, vanilla JS front-end). Don't change unrelated UI/workflow.

---

## Feature 1 — Wash-queue priority (High / Normal)

Customer Service or Admin can mark a returned car as **High priority**. High-priority
cars sort to the top of the wash queue so detailers clean them first. Default is Normal.

### Database
- Add a column to `jobs`: `priority text NOT NULL DEFAULT 'normal'` with a check
  constraint `priority IN ('high','normal')`.
- Provide it as a migration (e.g. `db/migrations/00X_add_priority.sql`) so it can run
  against the existing Neon database without recreating tables:
  `ALTER TABLE jobs ADD COLUMN priority text NOT NULL DEFAULT 'normal'
   CHECK (priority IN ('high','normal'));`

### API
- **Check-in** (`POST /jobs`): accept optional `priority` ('high'|'normal', default
  'normal') and store it.
- **New** `POST /jobs/:id/priority`: body `{priority}`; allowed for **admin and cs** on a
  job in their branch; only meaningful while status is `awaiting_wash`. Return the updated
  job. Validate the value; reject anything else with a clear 400.
- Include `priority` in every job payload returned by `GET /jobs`.

### Front-end
- **Check-in form**: add a "High priority" checkbox next to Check-in time; send it on
  submit. Reset it after a successful check-in.
- **Wash queue sort**: sort High before Normal, then by the existing order (sort_order /
  wait time). Concretely, compare by a priority rank first (high=0, normal=1), then fall
  back to the current `washSortKey`.
- **Badge**: render a small "PRIORITY" pill on high-priority rows (reuse the existing
  `.badge` style; add a `.badge.priority` rule, e.g. amber `background:#fef08a;
  color:#854d0e`) and optionally tint the row (`background:#fffbeb`).
- **Toggle**: in each wash-queue row, for admin/cs, show a star button (☆ off / ★ on,
  amber when on) that calls the priority endpoint and re-renders. Keep the admin
  up/down reorder arrows for ordering *within* the same priority.
- Detailers see the badge but no toggle; their "Start clean" button is unchanged.

### Acceptance
- Checking in a car with the box ticked puts it at the top of the queue with a PRIORITY
  badge, persisted in Neon and visible on other devices.
- An admin/cs can toggle priority on an existing queued car and the order updates.
- High cars always sit above Normal cars; within a priority group the previous ordering
  is preserved.

## Feature 2 — Calmer, non-disruptive auto-refresh

The queue currently calls a full `renderAll()` every 30s. Keep auto-refresh but make it
longer and non-disruptive, and keep the existing manual **Refresh** button doing a full
refresh.

### Requirements
- Change the interval from 30s to **90s** (define it as a single named constant so it's
  trivial to tune).
- The auto-tick must **not** do a full `renderAll()`. It should refresh only the live
  operational lists — the **wash queue** and **in-progress** list (and KPIs only if the
  dashboard is the active view). Do not rebuild table headers, the completed/history view,
  or destroy/recreate charts on the tick.
- **Pause the auto-tick when** any of these is true (skip that tick, don't reschedule):
  - the document is hidden (`document.hidden` / `visibilitychange`),
  - a claim ("Start clean") or finish notes row is currently open,
  - the user is focused in an input/textarea/select (so typing notes is never wiped).
- The **manual Refresh button** keeps doing the full refresh (re-fetch everything).
- Re-fetch from the API on refresh (not stale in-memory data), since this is the
  multi-user Neon version.

### Acceptance
- Background updates appear within ~90s without flicker or scroll jumps.
- Opening a "Start clean" notes row and typing is never interrupted by a refresh.
- Switching tabs away pauses polling; returning resumes it.
- Manual Refresh still updates everything immediately.

## Notes
- Enforce all permission/branch rules server-side, not just in the UI.
- Keep changes minimal and within the existing file/structure; don't restyle the app.
