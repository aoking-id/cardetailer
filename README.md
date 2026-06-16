# Car Detailer

Multi-branch car wash job tracker for airport rental returns. Customer Service checks vehicles in → cars join the wash queue → detailers clean them → completed jobs appear in history. Data is shared live across devices via **Neon Postgres** and **Netlify**.

**Live site (example):** [pah-detailer.netlify.app](https://pah-detailer.netlify.app)

---

## How to use

Open **Help** in the app navigation (or **Help guide** on the login screen) for the full staff guide. The summary below is also in [`README.md`](README.md) for admins and developers.

### Sign in

1. Open the app URL in your browser.
2. Enter your **username** and **password** (your admin creates accounts).
3. After login you land on the view for your role (admin → Dashboard, everyone else → Wash List).

Use **Refresh** in the top bar to reload all data immediately. The app also auto-updates the wash queue every ~90 seconds without interrupting you while you type notes.

Use **Sign out** when you finish your shift.

### Roles at a glance

| Role | What they do |
|------|----------------|
| **Customer Service (CS)** | Check in returned cars, edit check-ins while waiting, mark priority |
| **Detailer** | Work the wash queue — start and finish cleans |
| **Admin** | Everything CS can do, plus dashboard, user/branch management |

You only see branches you are assigned to. Admin can switch to **All branches** in the branch dropdown.

---

### Customer Service — daily workflow

#### 1. Check in a returned car

1. Go to **Check-In**.
2. Fill in the form:
   - **Rego** (required)
   - **ACRISS group** (optional, e.g. `CDAR`)
   - **Fuel** (0–8 eighths, optional)
   - **Mileage** (optional)
   - **Check-in time** (defaults to now)
   - **Priority** — tick if this car must be washed before normal queue items
3. Click **Check in**.

The car appears on **Wash List → Wash queue** for detailers at your branch.

#### 2. Edit a check-in

You can fix mistakes **before a detailer starts cleaning**. You do **not** need to be the person who originally checked the car in — any CS or admin for that branch can edit.

**Where to edit:**

- **Wash List** — click **Edit** on a row in the wash queue, or
- **Check-In → Recent check-ins** — click **Edit** in the **Actions** column

**What you can change:** rego, ACRISS, fuel, mileage, check-in time, priority.

**When Edit is not available:**

- Status is **In progress** or **Completed** (detailer already started)
- You are logged in as a **detailer** (read-only for check-ins)

#### 3. Mark or clear priority

On **Wash List**, for cars still waiting:

- Click the **star** on a normal row to mark **priority** (jumps to top of queue).
- Click **Clear** on a priority row to return it to the normal queue.

Priority cars show a **star** in the first column and a light amber row background. Detailers see the star but cannot change priority.

---

### Detailer — daily workflow

Detailers use **Wash List** only (larger buttons on tablet-friendly layout).

#### 1. Pick the next car

Open **Wash List → Wash queue**. Work **top to bottom**:

- **Priority** cars (star) are always above normal cars.
- Within each group, oldest wait time is first.

#### 2. Start a clean

1. Click **Start clean** on your branch’s next car.
2. Add optional **initial notes** (damage, stains, etc.).
3. Click **Start clean** again to confirm.

The car moves to **In progress**.

#### 3. Finish a clean

1. In **In progress**, find your job (only your rows show **Finish**).
2. Click **Finish**.
3. Add optional **after-clean notes**.
4. Click **Confirm finish**.

The job moves to **Completed history**.

> **Tip:** Auto-refresh pauses while a notes row is open or you are typing, so your notes won’t be wiped.

---

### Admin — extra features

#### Dashboard

KPIs for check-ins today, queue length, in-progress count, completions, and average wait/wash times. Charts show the last 7 days and per-branch snapshot.

#### Admin panel

- **Branches** — add, rename, or delete (delete blocked if the branch has jobs).
- **Users** — create CS, detailer, or admin users; assign branches; reset password; activate/deactivate.

After first deploy, change the default admin password under **Admin → Users → Edit**.

---

### Wash List — sections explained

| Section | Purpose |
|---------|---------|
| **Wash queue** | Cars waiting to be cleaned |
| **In progress** | Cars currently being detailed |
| **Completed history** | Finished jobs — filter by rego, detailer, date range; **Export CSV** |

---

### Branch switcher

If you belong to more than one branch (or you are admin), use the **branch dropdown** in the top bar to filter what you see. Admin’s **All branches** view shows every branch with a branch column in tables.

---

### Priority queue (simple rules)

1. **Priority** cars always sit **above** normal cars.
2. Mark priority at check-in (checkbox) or later (star on wash queue).
3. Clearing priority sends the car to the **back of the normal queue**.
4. Order within priority vs normal is automatic — no manual reordering.

---

## First-time setup (admin / developer)

### Stack

- **Frontend:** `index.html`, `app.js`, `api.js`
- **API:** Netlify Functions → `/api/*`
- **Database:** Neon Postgres

### Environment variables (Netlify)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon **pooled** connection string (`-pooler` host) |
| `JWT_SECRET` | Long random string for session tokens |

Copy `.env.example` to `.env` for local `netlify dev`. Never commit secrets.

### Neon database

1. Create a project at [neon.tech](https://neon.tech).
2. Run schema and seed:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/seed.sql
   ```

3. If upgrading an existing database, run migrations in order:

   ```bash
   psql "$DATABASE_URL" -f db/migrations/001_add_priority.sql
   ```

### Default login (after seed)

| Username | Password |
|----------|----------|
| `admin`  | `admin`    |

Change this immediately after first login.

### Local development

```bash
npm install
cp .env.example .env   # fill DATABASE_URL and JWT_SECRET
npm run dev            # usually http://localhost:8888
```

### Deploy to Netlify

1. Push the repo to GitHub.
2. Netlify → **Import from Git** → select repo (settings from `netlify.toml`).
3. Set `DATABASE_URL` and `JWT_SECRET` under **Environment variables**.
4. Deploy; subsequent pushes auto-deploy.

---

## API reference

| Method | Path | Who | Description |
|--------|------|-----|-------------|
| POST | `/api/auth/login` | — | Login |
| GET | `/api/me` | JWT | Current user |
| GET/POST | `/api/branches` | JWT / admin | List / create branches |
| PATCH/DELETE | `/api/branches/:id` | admin | Rename / delete branch |
| GET/POST | `/api/users` | admin | List / create users |
| PATCH | `/api/users/:id` | admin | Update user |
| GET/POST | `/api/jobs` | JWT / CS+admin | List jobs / check in |
| PATCH | `/api/jobs/:id/intake` | CS+admin | Edit check-in (awaiting wash only) |
| POST | `/api/jobs/:id/priority` | CS+admin | Set priority high/normal |
| POST | `/api/jobs/:id/claim` | detailer | Start clean |
| POST | `/api/jobs/:id/finish` | detailer | Finish clean |

Branch access is enforced on the server for every job action.

---

## Troubleshooting

| Problem | Likely cause |
|---------|----------------|
| Can’t see **Edit** | Wrong role (need CS/admin), or car already in progress/done |
| Priority star not showing | Hard refresh (`Ctrl+Shift+R`); ensure `assets/priority-star.png` is deployed |
| “Branch id required” on save | Redeploy latest code (API passes id in query string) |
| Changes not visible on another device | Wait ~90s or click **Refresh** |
| Login fails | Check Netlify env vars; confirm user exists and is active |

---

## Repository

GitHub: [aoking-id/cardetailer](https://github.com/aoking-id/cardetailer)
