# PR Review Assistant — Webhook Setup Guide
# GitHub Automation: Webhook → FastAPI → AI Review → GitHub PR Comments

## Overview

For GitHub webhooks to reach your local backend, you need a public URL.
This guide uses **ngrok** to create a secure tunnel from a public URL to your local port 8000.

---

## Step 1: Install ngrok

**Download:** https://ngrok.com/download

**Or via winget (Windows):**
```powershell
winget install ngrok.ngrok
```

**Verify installation:**
```powershell
ngrok --version
```

---

## Step 2: Set Your GITHUB_TOKEN

The background webhook task needs a GitHub token to:
1. Fetch PR diffs from the GitHub API
2. Post AI review comments back to the PR

**Create a Personal Access Token:**
1. Go to: https://github.com/settings/tokens → "Generate new token (classic)"
2. Select scopes: ✅ `repo` (full repo access)
3. Copy the token

**Set it in `backend/.env`:**
```env
GITHUB_TOKEN=ghp_your_token_here
```

---

## Step 3: Start ngrok

Open a **new terminal** and run:
```powershell
ngrok http 8000
```

You'll see output like:
```
Forwarding   https://abc123def456.ngrok.io -> http://localhost:8000
```

Copy the `https://...ngrok.io` URL.

---

## Step 4: Update WEBHOOK_URL in .env

In `backend/.env`, set:
```env
WEBHOOK_URL=https://abc123def456.ngrok.io/api/review/webhook
```

**Important:** Always include `/api/review/webhook` at the end.

---

## Step 5: Restart the Backend

```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Step 6: Verify Webhook Configuration

Open in your browser:
```
http://localhost:8000/api/monitoring/webhook-status
```

You should see:
```json
{
  "webhook_url": "https://abc123.ngrok.io/api/review/webhook",
  "webhook_url_is_public": true,
  "github_token_configured": true,
  "ready": true,
  "issues": []
}
```

If `ready` is `false`, fix the listed issues before continuing.

---

## Step 7: Add a Repository to Monitor

1. Open the dashboard: http://localhost:5173
2. Sign in with GitHub
3. Go to the **"Continuous PR Monitoring"** panel
4. Enter your repo in `owner/repo` format and click **+**
5. The system will automatically register a GitHub webhook on that repo

**Verify webhook was created:**
- Go to: `https://github.com/your-org/your-repo/settings/hooks`
- You should see a webhook pointing to your ngrok URL

---

## Step 8: Test the Pipeline

### Trigger a webhook event:
```bash
git checkout -b test-review
echo "# test" >> README.md
git add .
git commit -m "test: trigger webhook review"
git push origin test-review
```

Then open a Pull Request targeting main.

### Expected terminal output:
```
============================================================
[Webhook Received] PR event for: owner/repo PR #1
[Webhook Received] PR URL: https://github.com/owner/repo/pull/1
============================================================
[Webhook] ✅ Signature validated
[Auth] Resolving GitHub token...
[Auth] ✅ Using GITHUB_TOKEN from environment
[DB] Creating review record (status=running)...
[DB] ✅ Review record created: uuid-here
[PR Event Detected] action=opened  repo=owner/repo  PR=#1
[Fetching Diff] Contacting GitHub API...
[Running AI Review] Sending diff to NVIDIA NIM AI engine...
[AI Complete] Found 3 issues (1 critical)
[Generating Comments] Formatting review for GitHub...
[Posting GitHub Review] ✅ Review posted successfully!
[Review Posted Successfully] URL: https://github.com/owner/repo/pull/1#pullrequestreview-...
[DB] ✅ Review record updated to 'complete'
[Webhook Complete] Background review finished for owner/repo PR #1
============================================================
```

### Check GitHub PR:
- Open your PR on GitHub
- You should see an AI review comment with a full analysis

### Check dashboard:
- The "Live Review Feed" should show the review (updates every 4 seconds)

---

## Troubleshooting

### "Webhook URL is not publicly reachable"
→ ngrok is not running or WEBHOOK_URL is not set in .env

### "GITHUB_TOKEN is not set"
→ Add your PAT to `GITHUB_TOKEN=` in backend/.env, restart backend

### GitHub shows "webhook delivery failed"
→ Check ngrok is running and WEBHOOK_URL matches the current ngrok URL
→ ngrok URLs change each restart — update .env when you restart ngrok

### No review comment on GitHub PR
→ Check terminal logs for [ERROR] messages
→ Ensure token has `repo` scope (not just `public_repo`)

### Dashboard shows no reviews
→ Verify you're signed in with GitHub on the dashboard
→ Check the repo is added to monitoring (Monitoring Panel)

---

## Production Deployment

For production (e.g., Render, Railway, Fly.io):

```env
# backend/.env (production)
WEBHOOK_URL=https://your-backend.onrender.com/api/review/webhook
GITHUB_CALLBACK_URL=https://your-backend.onrender.com/api/auth/github/callback
FRONTEND_URL=https://your-frontend.vercel.app
ALLOWED_ORIGINS=["https://your-frontend.vercel.app"]
```

Update your GitHub OAuth App settings to use the production callback URL.
