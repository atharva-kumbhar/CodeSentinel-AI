# Enterprise AI PR Review Platform — Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  http://localhost:5173                                        │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ ModelSelector│  │ ReviewDashboard│  │  IssueCard        │ │
│  │ (7 providers)│  │ (Score Gauges)│  │  (Before/After)   │ │
│  └──────────────┘  └───────────────┘  └───────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP / Session Cookie
┌─────────────────────────────▼───────────────────────────────┐
│                    Backend (FastAPI)                          │
│  http://localhost:8000                                        │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ /api/review │  │ /api/auth     │  │ /api/review/      │  │
│  │ /url  /diff │  │ /github/login │  │ /webhook          │  │
│  │ /fix  /test │  │ /github/cb    │  │ (BackgroundTask)  │  │
│  └─────────────┘  └───────────────┘  └───────────────────┘  │
└──────────────┬───────────────┬──────────────────────────────┘
               │               │
    ┌──────────▼───┐   ┌───────▼──────────┐
    │  NVIDIA NIM  │   │   GitHub API      │
    │  (or any LLM)│   │  PR fetch + post  │
    └──────────────┘   └──────────────────┘
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Git

---

## Step 1 — Clone and Set Up

```bash
git clone https://github.com/your-org/pr-review-assistant
cd pr-review-assistant
```

---

## Step 2 — Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your values (see each section below).

---

## Step 3 — NVIDIA NIM API Key (Required for AI Reviews)

1. Go to [https://build.nvidia.com/](https://build.nvidia.com/)
2. Sign in → **Get API Key**
3. Copy the key (`nvapi-…`)
4. Add to `.env`:

```env
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

> **Tip**: The frontend ModelSelector lets users switch to GPT-4, Claude, DeepSeek, etc. at runtime using their own temporary API keys.

---

## Step 4 — GitHub OAuth App (Private Repo Support)

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**
2. Fill in:
   - **Application name**: `PR Review Assistant`
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:8000/api/auth/github/callback`
3. Click **Generate a new client secret**
4. Add to `.env`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:8000/api/auth/github/callback
FRONTEND_URL=http://localhost:5173
```

5. Generate a session secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
```env
SESSION_SECRET_KEY=your-generated-secret
```

---

## Step 5 — GitHub Webhook (Auto-Review PRs)

For **automatic review when PRs are opened**:

1. Generate a webhook secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

2. Add to `.env`:
```env
WEBHOOK_SECRET=your-webhook-secret
```

3. Deploy your backend (see Production section below)

4. Go to your GitHub repo → **Settings → Webhooks → Add webhook**:
   - **Payload URL**: `https://your-backend.com/api/review/webhook`
   - **Content type**: `application/json`
   - **Secret**: paste your `WEBHOOK_SECRET`
   - **Which events**: Select **Pull requests**
   - ✅ Active

> The webhook handler returns `202 Accepted` immediately and runs the review in a background task — so GitHub never times out.

---

## Step 6 — GitHub Action Setup (CI/CD Integration)

Add these secrets to your GitHub repo (**Settings → Secrets → Actions**):

| Secret | Value |
|--------|-------|
| `REVIEW_API_URL` | Your deployed backend URL, e.g. `https://your-app.onrender.com` |
| `NVIDIA_API_KEY` | Your NVIDIA NIM API key |

The workflow file (`.github/workflows/review.yml`) triggers on every PR open/sync/reopen.

---

## Step 7 — Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:8000
```

---

## Step 8 — Start the Application

### Backend
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```

Open: **http://localhost:5173**  
API docs: **http://localhost:8000/api/docs**

---

## Environment Variable Reference

### Backend `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | ✅ | NVIDIA NIM API key for default AI reviews |
| `NVIDIA_BASE_URL` | ✅ | NVIDIA API endpoint (default: `https://integrate.api.nvidia.com/v1`) |
| `NVIDIA_MODEL` | ✅ | Model name (default: `meta/llama-3.1-70b-instruct`) |
| `GITHUB_CLIENT_ID` | ⚠️ OAuth | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | ⚠️ OAuth | GitHub OAuth app client secret |
| `GITHUB_CALLBACK_URL` | ⚠️ OAuth | OAuth callback URL |
| `SESSION_SECRET_KEY` | ✅ | HMAC signing key for session cookies |
| `GITHUB_TOKEN` | Optional | Server-side fallback PAT for public repos |
| `WEBHOOK_SECRET` | ⚠️ Webhook | Signature verification for GitHub webhooks |
| `FRONTEND_URL` | ✅ | Frontend URL for OAuth redirects |
| `ALLOWED_ORIGINS` | ✅ | JSON array of allowed CORS origins |
| `AI_TEMPERATURE` | Optional | AI creativity (default: `0.1`) |
| `AI_MAX_TOKENS` | Optional | Max AI output tokens (default: `4096`) |

---

## Multi-LLM Support

The ModelSelector (top bar) allows runtime switching between:

| Provider | Key Source |
|----------|------------|
| NVIDIA Nemotron | [build.nvidia.com](https://build.nvidia.com/) |
| NVIDIA Llama 3.1 70B | [build.nvidia.com](https://build.nvidia.com/) |
| GPT-4 / GPT-4o | [platform.openai.com](https://platform.openai.com/) |
| Claude 3.5 Sonnet | [console.anthropic.com](https://console.anthropic.com/) |
| Llama 3 (Groq) | [console.groq.com](https://console.groq.com/) |
| Mixtral (Groq) | [console.groq.com](https://console.groq.com/) |
| DeepSeek Coder | [platform.deepseek.com](https://platform.deepseek.com/) |
| Qwen Coder | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com/) |

> **Security**: API keys entered in the modal are stored in React state only — never persisted to `localStorage`, never sent to the backend permanently.

---

## Production Deployment

### Backend (Render / Railway / Fly.io)

1. Set all environment variables in your hosting dashboard
2. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Update `ALLOWED_ORIGINS` to include your Vercel URL
4. Set `ENV=production` (enables `Secure` cookie flag)

### Frontend (Vercel)

1. Set `VITE_API_URL=https://your-backend.onrender.com` in Vercel environment
2. Deploy with: `npm run build`
3. Update GitHub OAuth callback URL to your production backend URL

---

## Feature Summary

| Feature | Status |
|---------|--------|
| AI review via GitHub PR URL | ✅ |
| Inline GitHub PR comment posting | ✅ |
| GitHub OAuth (private repos) | ✅ |
| GitHub Webhook (auto review) | ✅ Background task |
| GitHub Action CI/CD integration | ✅ |
| Multi-LLM runtime switching | ✅ 8 providers |
| Test Connection button | ✅ |
| 7-step live review pipeline UI | ✅ |
| Before/After AI fix split view | ✅ |
| Security Score gauge | ✅ |
| Performance Score gauge | ✅ |
| Review Timeline activity feed | ✅ |
| PR Metadata card | ✅ |
| Sidebar Security/Performance filter | ✅ |
| Master NVIDIA system prompt | ✅ |
