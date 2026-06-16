# Car Detailer

Multi-user car detailer job tracker: CS check-in → wash queue → detailer claim/finish → history and admin dashboard. Front-end is static HTML/JS; all data lives in **Neon Postgres** via **Netlify Functions**.

## Stack

- **Frontend:** `index.html`, `app.js`, `api.js` (published as static site root)
- **API:** Netlify Functions under `netlify/functions/` → `/api/*`
- **Database:** Neon Postgres (`@neondatabase/serverless`, pooled connection string)

## Required environment variables

Set these in the **Netlify dashboard** (Site settings → Environment variables). Never commit them.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`). Example: `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | Long random string used to sign session tokens |

For local development, copy `.env.example` to `.env` in the project root (gitignored).

## Neon setup

1. Create a project at [neon.tech](https://neon.tech).
2. In the Neon console, open **SQL Editor** (or connect with `psql`).
3. Run the schema:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```

4. Seed demo branches and admin user (`admin` / `admin`):

   ```bash
   psql "$DATABASE_URL" -f db/seed.sql
   ```

5. Copy the **pooled** connection string from Neon → Connection details → **Pooled connection**. Use that as `DATABASE_URL`.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm run dev            # netlify dev — serves site + functions
```

Open the URL shown (usually `http://localhost:8888`).

## Netlify deploy

1. Push this repo to GitHub.
2. In Netlify: **Add new site** → **Import from Git** → select the repo.
3. Build settings (usually auto-detected from `netlify.toml`):
   - **Publish directory:** `.` (root)
   - **Functions directory:** `netlify/functions`
4. Add `DATABASE_URL` and `JWT_SECRET` under **Site configuration → Environment variables**.
5. Deploy. Netlify redeploys on every push to the connected branch.

## API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login, returns JWT + user |
| GET | `/api/me` | JWT | Current user |
| GET/POST | `/api/branches` | JWT | List / create (admin) |
| PATCH/DELETE | `/api/branches/:id` | admin | Rename / delete |
| GET/POST | `/api/users` | admin | List / create |
| PATCH | `/api/users/:id` | admin | Update user |
| GET/POST | `/api/jobs` | JWT | List / check-in |
| POST | `/api/jobs/:id/claim` | detailer | Start clean |
| POST | `/api/jobs/:id/finish` | detailer | Finish clean |
| POST | `/api/jobs/:id/reorder` | admin | Move queue item |

## GitHub push (first time)

If you have not created a remote yet:

```bash
git init
git add .
git commit -m "Wire Car Detailer to Neon + Netlify Functions"
gh repo create car-detailer --private --source=. --push
```

Or create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/car-detailer.git
git push -u origin main
```

Replace `YOUR_USER/car-detailer` with your repo name/URL.

## Default login

After running `db/seed.sql`:

- **Username:** `admin`
- **Password:** `admin`

Change the password after first login via Admin → Users.
