# 🤖 PR Review Assistant (CodeSentinel-AI)

> **🚀 LIVE DEMO:** This project is fully deployed and can be tested right now at: 
> **[https://atharvark07-codesentinel-ai.hf.space/](https://atharvark07-codesentinel-ai.hf.space/)**

> An AI-powered GitHub Pull Request Review Assistant that acts like a senior staff engineer.
> Detect security vulnerabilities, bugs, performance bottlenecks, and code quality issues automatically.

**Powered by NVIDIA NIM · Multi-LLM Support · FastAPI · React · Tailwind CSS**

---

## ✨ Features

- 🔴 **Security Scanning** — SQL injection, XSS, secrets in code, auth bypass
- 🟠 **Performance Analysis** — N+1 queries, memory leaks, blocking I/O
- 🟡 **Bug Detection** — Logic errors, null derefs, race conditions
- 🟢 **Code Quality** — SOLID violations, DRY, naming, complexity
- 🤖 **Multi-LLM Support** — Switch between NVIDIA NIM, GPT-4, Claude 3.5, DeepSeek, and Groq at runtime.
- ⚡ **Three Integration Modes** — Web Dashboard, GitHub Action CI/CD, and Live Webhook Auto-Reviewing
- 📝 **Inline GitHub Comments** — Posts fixes natively as GitHub "Apply Suggestion" blocks
- 🎨 **Premium Dark Dashboard** — GitHub Dark × Linear × Vercel inspired

---

## 🏗 Project Structure

```text
CodeSentinel-AI/
├── backend/                      # FastAPI backend
│   ├── main.py                   # App entry point
│   ├── config.py                 # Settings via pydantic-settings
│   ├── requirements.txt          # Python dependencies
│   ├── .env.example              # Environment variable template
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic request/response models
│   ├── services/
│   │   ├── __init__.py
│   │   ├── github_service.py     # GitHub API integration (PyGithub)
│   │   ├── ai_service.py         # Multi-LLM AI integration
│   │   ├── firebase_service.py   # Database state and token storage
│   │   └── orchestrator.py       # Central review engine
│   └── routers/
│       ├── __init__.py
│       ├── monitoring.py         # GitHub Webhook & Repo monitoring
│       └── review.py             # Review triggers & GitHub callbacks
│
├── frontend/                     # React + Tailwind CSS dashboard
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx               # Root app with layout
│       ├── context/
│       │   └── AuthContext.jsx   # GitHub OAuth context
│       ├── api/
│       │   └── reviewApi.js      # Axios API client
│       └── components/           # UI Components
│
└── .github/
    ├── workflows/
    │   └── review.yml            # GitHub Action workflow
    └── scripts/
        └── review_pr.py          # CI/CD review script
```

---

## 🚀 Local Setup Guide

### Prerequisites

- Python 3.11+
- Node.js 18+
- NVIDIA NIM API key (free tier available at [build.nvidia.com](https://build.nvidia.com))
- GitHub OAuth App configured (for Web Dashboard login & Webhook setup)

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Edit .env and add your keys:
# NVIDIA_API_KEY=nvapi-...
# GITHUB_CLIENT_ID=your_oauth_client_id
# GITHUB_CLIENT_SECRET=your_oauth_secret
```

### 2. Start Backend

```bash
# From the backend/ directory (with venv activated)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/api/docs

---

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Copy environment file
copy .env.example .env.local     # Windows
# cp .env.example .env.local     # macOS/Linux

# The default VITE_API_URL=http://localhost:8000 works for local dev

# Start development server
npm run dev
```

Dashboard available at: http://localhost:5173

---

## 🌐 Deployment

### Backend — Hugging Face Spaces / Render.com

1. Push code to GitHub
2. Connect your GitHub repository to your hosting provider
3. Configure build settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add **Environment Variables**:
   ```env
   NVIDIA_API_KEY=nvapi-...
   GITHUB_CLIENT_ID=your_id
   GITHUB_CLIENT_SECRET=your_secret
   FRONTEND_URL=https://your-frontend.vercel.app
   WEBHOOK_SECRET=your-secure-secret
   ```

### Frontend — Vercel

1. Go to vercel.com → New Project
2. Import your GitHub repository
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
4. Add **Environment Variable**:
   ```env
   VITE_API_URL=https://your-deployed-backend-url.com
   ```
5. Deploy → your dashboard is live!

---

## ⚡ GitHub Integration Setup

### Webhook Mode (Auto-Review)
1. Log in to the web dashboard via GitHub OAuth.
2. Select repositories to monitor.
3. The platform automatically registers a GitHub Webhook for PRs.
4. When a PR is opened/synced, the backend analyzes it and posts inline review comments automatically!

### GitHub Action Mode (CI/CD)
Add these repository secrets (Settings → Secrets → Actions):
```env
REVIEW_API_URL = https://your-deployed-backend-url.com
NVIDIA_API_KEY = your-nvapi-key
```
The workflow located at `.github/workflows/review.yml` will trigger on PR updates, fetch the diff, send it to your API, and post a detailed Markdown comment.

---

## 🔑 Environment Variables Reference

### Backend `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | ✅ | NVIDIA NIM API key from build.nvidia.com |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET`| ✅ | GitHub OAuth app client secret |
| `SESSION_SECRET_KEY` | ✅ | HMAC signing key for session cookies |
| `FRONTEND_URL` | ✅ | Frontend URL for OAuth redirects |
| `WEBHOOK_SECRET` | ⚠️ | Signature verification for GitHub webhooks |
| `NVIDIA_BASE_URL` | ❌ | Default: `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | ❌ | Default: `meta/llama-3.1-70b-instruct` |

### Frontend `.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Backend API base URL |

---

## 🛡 Security

- All API keys stored in `.env` — never committed to Git
- Tokens encrypted in the database via Fernet symmetric encryption
- CORS middleware restricts origins in production
- User OAuth tokens handle API requests, ensuring actions reflect actual GitHub permissions
- Webhooks protected by HMAC SHA-256 signature validation

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Engine | NVIDIA NIM · Llama 3.1 70B Instruct / Multi-LLM |
| Backend | FastAPI · Python 3.11 |
| Auth & Events | GitHub OAuth · GitHub Webhooks |
| Data Validation | Pydantic v2 |
| Frontend | React 18 · Vite |
| Styling | Tailwind CSS v3 |
| Icons | Lucide React |
| CI/CD | GitHub Actions |

---

*Production-ready architecture, built to secure and optimize enterprise codebases at scale.*
