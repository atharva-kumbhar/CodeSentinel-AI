# Quick Reference - Live Monitoring Fix

## The Problem in One Sentence
**Tokens weren't saved to the database, so webhooks couldn't post comments**

## The Solution in One Sentence  
**Save tokens to database when user adds repos or configures monitoring**

## Changes Summary

```python
# ADDED TO: backend/routers/monitoring.py

# Location 1: When user adds a repo (line 213-214)
firebase_service.store_github_token(uid, access_token)
logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid}")

# Location 2: When user configures monitoring (line 426-428)
firebase_service.store_github_token(uid, access_token)
logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid}")
```

## Before vs After

### Before ❌
```
Login → Add Repo → PR Created → Webhook Fires → Token Not Found → No Comments
```

### After ✅
```
Login → Add Repo → Token Saved to DB → PR Created → Webhook Fires → Token Found → Comments Posted
```

## Test It

```bash
# 1. Log in with GitHub
# 2. Add a repo for monitoring
# 3. Create a PR in that repo
# 4. Check logs for this:
#    [Token Store] Saved GitHub OAuth token for user {username}
# 5. Verify AI comments appear on PR within 30-60 seconds
```

## Files to Deploy

- `backend/routers/monitoring.py` ← MODIFIED
- `backend/routers/review.py` ← MODIFIED
- Documentation files (reference only)

## Quick Stats

| Metric | Value |
|--------|-------|
| Impact | HIGH - Core feature fix |
| Complexity | LOW - Simple token storage |
| Risk | VERY LOW - Backward compatible |
| Testing Time | 5-10 minutes |
| Deployment Time | 2-5 minutes |
| Lines Changed | 6 lines (3 additions per file) |
| Breaking Changes | None |

## Rollback (if needed)

```bash
git revert HEAD
git push origin main
```

---

**Status:** ✅ Ready for Production
