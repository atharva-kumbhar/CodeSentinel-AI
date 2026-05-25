# Live Monitoring Webhook Flow - Fixed

## Before (Broken) ❌

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User logs in with GitHub OAuth                              │
│    → Token stored in SESSION ONLY (not database)               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User adds repo for monitoring                                │
│    → Webhook created on GitHub                                  │
│    → Repo config saved                                          │
│    ⚠️  Token NOT stored in database                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PR created in monitored repo                                 │
│    → GitHub sends webhook event                                 │
│    → Backend receives event                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Backend webhook handler runs                                 │
│    → Tries to retrieve token from database                      │
│    ❌ retrieve_github_token() returns None (never stored!)      │
│    → Falls back to GITHUB_TOKEN env var                         │
│    → Usually not configured or wrong permissions               │
│    ❌ Cannot post comments                                       │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Result: NO comments posted on PR                                │
│ User has to manually comment to trigger review                  │
└─────────────────────────────────────────────────────────────────┘
```

## After (Fixed) ✅

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User logs in with GitHub OAuth                              │
│    → Token stored in SESSION + DATABASE (encrypted)            │
│    ✅ upsert_user(access_token=token)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User adds repo for monitoring                                │
│    → Webhook created on GitHub                                  │
│    → Repo config saved                                          │
│    ✅ store_github_token(username, token) [NEW!]               │
│    → Token stored securely in database                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. User configures monitoring settings                          │
│    ✅ store_github_token(username, token) [NEW!]               │
│    → Token refreshed/stored again                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. PR created in monitored repo                                 │
│    → GitHub sends webhook event                                 │
│    → Backend receives event                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Backend webhook handler runs                                 │
│    → Tries to retrieve token from database                      │
│    ✅ retrieve_github_token() returns stored token              │
│    → Token is valid and has proper permissions                 │
│    ✅ Runs AI review                                            │
│    ✅ Posts comments to GitHub PR automatically               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Result: AI review comments posted automatically! 🎉             │
│ User sees AI Suggested Fix + inline comments on PR              │
└─────────────────────────────────────────────────────────────────┘
```

## Key Changes

| Location | Change | Status |
|----------|--------|--------|
| `auth.py` line 91-97 | Store token on login | Already done ✅ |
| `monitoring.py` line 213-214 | Store token when adding repo | NEW ✅ |
| `monitoring.py` line 426-428 | Store token during config setup | NEW ✅ |
| `review.py` line 325-334 | Improved repo status logging | Improved ✅ |

## Database Storage

```json
{
  "users": {
    "github_username": {
      "access_token": "gho_encrypted_token_here",
      "email": "user@example.com",
      "display_name": "User Name",
      "photo_url": "https://...",
      "monitoring_enabled": true,
      "monitor_all_repositories": true,
      "selected_repositories": [],
      "created_at": "2024-...",
      "last_updated": "2024-..."
    }
  }
}
```

## Token Encryption

- Algorithm: Fernet (symmetric encryption)
- Key: Generated from `FIREBASE_TOKEN_ENCRYPTION_KEY` env var
- Storage: Firestore or Mock DB (`mock_db.json` for local dev)
- Retrieval: Only by backend webhook handler
- Frontend: Never has access to raw token

## Testing Checklist

- [ ] Deploy changes
- [ ] Log in with GitHub
- [ ] Add a repository for live monitoring
- [ ] Create a PR in that repo
- [ ] Check logs for: `[Token Store] Saved GitHub OAuth token...`
- [ ] Check PR for auto-generated AI comments ✅
- [ ] Verify comments appear with security issues highlighted
- [ ] Test with multiple repos
- [ ] Test with "monitor all repos" option
- [ ] Test with selected repos only
