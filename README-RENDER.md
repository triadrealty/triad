# Render Deployment Guide — Triad Realty

This repository is configured to deploy directly to **Render** (`https://render.com`) from the GitHub repository:
`https://github.com/triadrealty/triad.git`

---

## 1. How Automatic Deployments Work

Whenever you run `git push origin main`, Render automatically builds and deploys your changes.

There are two complementary ways this happens:

### A. Render's Native GitHub Integration (Recommended & Primary)
1. In your **Render Dashboard** (https://dashboard.render.com):
   - Select your Web Service (or click **New +** ➔ **Web Service**).
   - Connect your GitHub account and select repository: **`triadrealty/triad`**.
   - Under **Settings** ➔ **Auto-Deploy**, ensure it is set to **Yes**.
2. **Result**: Every push to the `main` branch immediately triggers a fresh build and zero-downtime deployment on Render.

### B. Render Deploy Hook (GitHub Actions Backup)
This repository includes [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) which triggers Render via webhooks:
1. In your Render service settings, find **Deploy Hook** and copy the URL (e.g., `https://api.render.com/deploy/srv-xxxxxx?key=yyyyyy`).
2. In your GitHub repository:
   - Go to **Settings** ➔ **Secrets and variables** ➔ **Actions**.
   - Add a repository secret named **`RENDER_DEPLOY_HOOK_URL`** with your Render Deploy Hook URL.
3. Every `git push origin main` will also call this deploy hook.

---

## 2. Build & Runtime Configuration

Render uses [`render.yaml`](render.yaml) automatically to configure the service:

| Setting | Value |
|---|---|
| **Environment** | Python 3.11 |
| **Root Directory** | `backend` |
| **Build Command** | `cd ../frontend && npm install --legacy-peer-deps && GENERATE_SOURCEMAP=false REACT_APP_SITE_URL=https://webtriad-9.onrender.com REACT_APP_BACKEND_URL="" npm run build && cp -r build ../backend/frontend_build && cd ../backend && pip install -r requirements.txt` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/api/` |

---

## 3. Environment Variables

Configure these environment variables in **Render Dashboard** ➔ **Environment**:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secure random string (min 32 characters) for signing authentication tokens. |
| `MONGO_URI` | Yes | MongoDB Atlas connection string (e.g., `mongodb+srv://...`). |
| `ENVIRONMENT` | Yes | Set to `production`. |
| `FORCE_HTTPS` | Yes | Set to `true`. |
| `DEVELOPER_EMAIL` | Yes | Developer account email (default: `developer@triad.ae`). |
| `DEVELOPER_PASSWORD`| Yes | Secure developer admin password. |
| `OWNER_EMAIL` | Yes | Owner account email (default: `owner@triad.ae`). |
| `OWNER_PASSWORD` | Yes | Secure owner admin password. |
| `STAFF_EMAIL` | Yes | Staff account email (default: `normal@triad.ae`). |
| `STAFF_PASSWORD` | Yes | Secure staff password. |
| `CLOUDINARY_CLOUD_NAME`| Yes | Cloudinary cloud name for media storage. |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key. |
| `CLOUDINARY_API_SECRET`| Yes | Cloudinary API secret. |
| `REACT_APP_BACKEND_URL`| Yes | `""` (empty string so frontend uses relative `/api` paths served by FastAPI). |
| `REACT_APP_SITE_URL` | Yes | `https://webtriad-9.onrender.com` (or your custom domain). |
| `CORS_ORIGINS` | Yes | `https://webtriad-9.onrender.com,https://www.triadrealty.ae` |
| `ALLOWED_HOSTS` | Yes | `webtriad-9.onrender.com,*.onrender.com,www.triadrealty.ae,triadrealty.ae,localhost,127.0.0.1` |
| `SITE_URL` | Yes | `https://webtriad-9.onrender.com` (or `https://www.triadrealty.ae`) |

---

## 4. Custom Domain Setup (e.g. `triadrealty.ae`)

To route your custom domain to Render:
1. In Render Dashboard ➔ Your Web Service ➔ **Settings** ➔ **Custom Domains**.
2. Add:
   - `triadrealty.ae` (Apex domain) ➔ Point A record to Render's IP address.
   - `www.triadrealty.ae` ➔ Point CNAME record to `triad-realty.onrender.com`.
3. Render automatically issues and renews Let's Encrypt SSL certificates for your custom domain.
