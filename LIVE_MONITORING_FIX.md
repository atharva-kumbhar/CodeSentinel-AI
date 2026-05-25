# Live Monitoring Auto-Commenting Fix

## Problem
When users added a repository for live monitoring and a PR was created, the webhook would fire but **NO AI-generated review comments would be posted automatically**. Users had to manually comment to trigger reviews.

## Root Cause
The GitHub OAuth token obtained during login was **never persisted to the database**. When the webhook handler tried to fetch the token to post AI review comments, it would:
1. Call `retrieve_github_token(username)` 
2. Get `None` (token was never stored)
3. Fall back to `GITHUB_TOKEN` env var (which may not be configured or have proper permissions)
4. Silently fail to post comments

**Files affected:**
- `backend/routers/monitoring.py` - Repo monitoring endpoints
- `backend/routers/review.py` - Webhook handler
- `backend/services/firebase_service.py` - Database operations

## Solution
Store the user's GitHub OAuth token **immediately** when:
1. ✅ User logs in via GitHub OAuth (already done in `auth.py` line 91-97)
2. ✅ User adds a repository for monitoring (`/api/monitoring/repos` POST)
3. ✅ User configures monitoring settings (`/api/monitoring/config` POST)

### Changes Made

#### `backend/routers/monitoring.py`

**Change 1: `/repos` endpoint (line 213-214)**
```python
# Store the user's GitHub OAuth token (needed for webhook auto-comments)
firebase_service.store_github_token(uid, access_token)
logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid} (auto-comment source)")
```

**Change 2: `/config` endpoint (line 426-428)**
```python
# Store the user's GitHub OAuth token (needed for webhook auto-comments)
firebase_service.store_github_token(uid, access_token)
logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid} during monitoring config setup")
```

#### `backend/routers/review.py`

**Change 3: Webhook repo check (line 325-330)**
Improved logging to show monitoring status (made non-blocking to allow webhook to proceed)

## How It Works Now

### Flow for Live Monitoring Auto-Comments
1. User signs in → OAuth token stored
2. User adds repo for monitoring → OAuth token stored again (ensures freshness)
3. PR is created on GitHub
4. GitHub sends webhook event to `POST /api/review/webhook`
5. Backend retrieves stored OAuth token from database
6. Backend runs AI review using PR diff
7. Backend posts review comments to GitHub PR **automatically** ✅

### Token Storage
- Encrypted via Fernet symmetric encryption
- Stored in Firestore or Mock DB (`mock_db.json` for local dev)
- Retrieved when webhook fires
- Never exposed to frontend

## Testing
After deploying this fix:

1. Log in with GitHub
2. Add a repository for live monitoring
3. Create a pull request in that repo
4. **Check logs**: You should see:
   ```
   [Token Store] Saved GitHub OAuth token for user {username} (auto-comment source)
   [Posting GitHub Review] ✅ Review posted successfully!
   ```
5. **Check PR**: AI review comments should appear automatically on the PR 🎉

## Fallback
If user's stored token fails (e.g., revoked), the webhook will fall back to `GITHUB_TOKEN` env var with appropriate error handling.

## Related Code
- Token encryption: `_get_fernet()` in `firebase_service.py`
- Token storage: `store_github_token()` in `firebase_service.py`  
- Token retrieval: `retrieve_github_token()` in `firebase_service.py`
- Webhook handler: `_run_webhook_review()` in `review.py` line 301
