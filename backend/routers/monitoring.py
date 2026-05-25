"""
Monitoring & Integration Router
───────────────────────────────
API endpoints for:
  - Repository monitoring configuration (add, remove, toggle)
  - Automatic GitHub webhook registration and deletion
  - User settings persistence (AI model, auto-review prefs)
  - Review history retrieval

Auth:
  - Uses GitHub OAuth session (github_username) as the ONLY login provider.
"""

import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from services import firebase_service
from services.github_service import GitHubService
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_uid(request: Request) -> Optional[str]:
    """
    Get the current user UID (GitHub login) from session.
    GitHub OAuth is the ONLY login provider.
    """
    return request.session.get("user_login")


def _require_uid(request: Request) -> str:
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please sign in with GitHub.",
        )
    return uid


def _get_webhook_url() -> str:
    """
    Resolve the public webhook callback URL.

    Priority:
    1. WEBHOOK_URL env var (explicit — required for ngrok / production)
    2. Derived from GITHUB_CALLBACK_URL (only works if backend is deployed publicly)

    GitHub CANNOT reach localhost. You must set WEBHOOK_URL to a public URL
    (e.g. https://abc123.ngrok.io/api/review/webhook) for local development.
    """
    # Priority 1: explicit public webhook URL (ngrok / deployed backend)
    explicit_url = getattr(settings, "WEBHOOK_URL", "").strip()
    if explicit_url:
        return explicit_url

    # Priority 2: derive from OAuth callback URL (works only if deployed)
    callback = settings.GITHUB_CALLBACK_URL
    if "/api/auth/github/callback" in callback:
        derived = callback.replace("/api/auth/github/callback", "/api/review/webhook")
        logger.warning(
            f"WEBHOOK_URL not set. Derived webhook URL: {derived}. "
            "This only works if your backend is publicly deployed. "
            "For local development, run ngrok and set WEBHOOK_URL in .env"
        )
        return derived

    fallback = "https://atharvark07-codesentinel-ai.hf.space"
    logger.error(
        f"Cannot resolve webhook URL — falling back to {fallback}. "
        "GitHub CANNOT reach localhost. Set WEBHOOK_URL in .env to a public ngrok URL."
    )
    return fallback


# ─── Integration Status ──────────────────────────────────────────────────────

@router.get("/status", summary="Service availability status")
async def integration_status():
    """Check availability of backend services."""
    firebase_active = firebase_service.is_firebase_available()
    return {
        "firebase_available": firebase_active,
        "firebase_real_active": firebase_active,
        "message": "Firebase cloud storage is active." if firebase_active else "Firebase Admin SDK is not configured. Monitoring settings will not be production-persistent.",
    }


@router.get("/webhook-status", summary="Webhook configuration diagnostics")
async def webhook_status():
    """
    Returns the current webhook configuration and diagnostics.
    Use this to verify your ngrok + webhook setup before testing.
    """
    webhook_url = _get_webhook_url()
    webhook_secret = getattr(settings, "WEBHOOK_SECRET", "")
    github_token   = getattr(settings, "GITHUB_TOKEN", "")
    explicit_url   = getattr(settings, "WEBHOOK_URL", "").strip()

    is_public = (
        webhook_url.startswith("https://") and
        "localhost" not in webhook_url and
        "127.0.0.1" not in webhook_url and
        "WEBHOOK_URL=" not in webhook_url and
        "your-ngrok-url" not in webhook_url
    )

    issues = []
    if "WEBHOOK_URL=" in webhook_url:
        issues.append("WEBHOOK_URL is malformed. Remove the duplicated 'WEBHOOK_URL=' prefix from backend/.env")
    if "your-ngrok-url" in webhook_url:
        issues.append("WEBHOOK_URL still contains the placeholder ngrok host. Replace it with your real ngrok HTTPS URL")
    if not is_public:
        issues.append("Webhook URL is not publicly reachable (localhost detected). GitHub cannot deliver events. Run ngrok and set WEBHOOK_URL in .env")
    if not github_token:
        issues.append("GITHUB_TOKEN is not set. Background webhook reviews will fail to fetch PR diffs and post comments. Add a token with 'repo' scope to .env")
    if not webhook_secret:
        issues.append("WEBHOOK_SECRET is not set. Webhook signature validation is disabled (security risk).")

    return {
        "webhook_url": webhook_url,
        "webhook_url_explicit": bool(explicit_url),
        "webhook_url_is_public": is_public,
        "webhook_secret_configured": bool(webhook_secret),
        "github_token_configured": bool(github_token),
        "ready": len(issues) == 0,
        "issues": issues,
        "instructions": {
            "ngrok_setup": "1. Install ngrok  2. Run: ngrok http 8000  3. Copy https URL  4. Set WEBHOOK_URL=https://xxxx.ngrok.io/api/review/webhook in backend/.env  5. Restart backend",
            "github_token": "Create at https://github.com/settings/tokens with 'repo' scope, set as GITHUB_TOKEN in backend/.env",
        } if issues else {},
    }


# ─── Firebase Session Sync (No-ops for compatibility/transition) ──────────────

class FirebaseSessionRequest(BaseModel):
    uid: str
    email: str = ""
    display_name: str = ""
    photo_url: str = ""

@router.post("/session/sync", summary="Sync session (Legacy support)")
async def sync_firebase_session(request: Request, body: FirebaseSessionRequest):
    """Legacy support - redirects users to use GitHub session only."""
    return {"status": "ignored", "message": "Using GitHub OAuth session only."}


@router.post("/session/logout", summary="Clear session (Legacy support)")
async def firebase_logout(request: Request):
    """Legacy support."""
    return {"status": "logged_out"}


@router.get("/session/me", summary="Get Firebase session (Legacy support)")
async def firebase_me(request: Request):
    """Legacy support - returns current GitHub session user info."""
    uid = _get_uid(request)
    if not uid:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "uid":          uid,
            "email":        request.session.get("user_email", ""),
            "display_name": request.session.get("user_name", ""),
            "photo_url":    request.session.get("user_avatar", ""),
        },
    }


# ─── Repository Monitoring ────────────────────────────────────────────────────

class AddRepoRequest(BaseModel):
    repo_full_name: str = Field(..., description="owner/repo format")
    auto_review: bool = True
    auto_post: bool = True
    ai_model: str = ""

class ToggleRepoRequest(BaseModel):
    repo_full_name: str
    enabled: bool

@router.post("/repos", summary="Add repository to monitoring")
async def add_repository(request: Request, body: AddRepoRequest):
    """
    Add a repository to continuous PR monitoring.
    Automatically registers a GitHub Webhook for real-time review triggers.
    """
    uid = _require_uid(request)
    access_token = request.session.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Active GitHub OAuth session is required to configure monitoring."
        )

    # Initialize GitHub client using user's token
    github_client = GitHubService(token=access_token)
    webhook_url = _get_webhook_url()
    webhook_secret = getattr(settings, "WEBHOOK_SECRET", "pr_review_secret_key")

    logger.info(f"Adding monitored repo '{body.repo_full_name}' and creating webhook at '{webhook_url}'")
    
    # Store the user's GitHub OAuth token (needed for webhook auto-comments)
    firebase_service.store_github_token(uid, access_token)
    logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid} (auto-comment source)")
    
    # Register webhook on GitHub
    webhook_success = github_client.create_webhook(
        repo_name=body.repo_full_name,
        callback_url=webhook_url,
        secret=webhook_secret
    )

    # Save integration data to Firestore/Mock DB
    success = firebase_service.add_monitored_repo(
        github_username=uid,
        repo_full_name=body.repo_full_name,
        auto_review_enabled=body.auto_review,
        webhook_active=webhook_success
    )

    if not success:
        raise HTTPException(500, "Failed to save repository configuration.")


    return {
        "status": "added",
        "repo": body.repo_full_name,
        "webhook_active": webhook_success,
        "message": "Continuous PR Monitoring enabled successfully." if webhook_success else "Monitored successfully, but failed to automatically create GitHub Webhook (make sure you have admin rights on this repository)."
    }


@router.get("/repos", summary="List monitored repositories")
async def list_repositories(request: Request):
    """Get all repositories configured for monitoring."""
    uid = _require_uid(request)
    repos = firebase_service.get_monitored_repos(uid)
    return {"repos": repos, "count": len(repos)}


@router.patch("/repos/toggle", summary="Toggle repository monitoring on/off")
async def toggle_repository(request: Request, body: ToggleRepoRequest):
    """
    Enable or disable auto-review for a specific repository.
    Creates or deletes the GitHub webhook automatically depending on the toggle.
    """
    uid = _require_uid(request)
    access_token = request.session.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="Active GitHub session required.")

    github_client = GitHubService(token=access_token)
    webhook_url = _get_webhook_url()
    webhook_secret = getattr(settings, "WEBHOOK_SECRET", "pr_review_secret_key")

    webhook_active = False
    if body.enabled:
        # Create webhook
        webhook_active = github_client.create_webhook(
            repo_name=body.repo_full_name,
            callback_url=webhook_url,
            secret=webhook_secret
        )
    else:
        # Delete webhook
        github_client.delete_webhook(
            repo_name=body.repo_full_name,
            callback_url=webhook_url
        )
        webhook_active = False

    # Update state in database
    firebase_service.update_repo_monitoring(body.repo_full_name, body.enabled)
    firebase_service.update_webhook_status(body.repo_full_name, webhook_active)

    return {
        "status": "updated",
        "repo": body.repo_full_name,
        "enabled": body.enabled,
        "webhook_active": webhook_active
    }


@router.delete("/repos/{repo_owner}/{repo_name}", summary="Remove repository from monitoring")
async def remove_repository(request: Request, repo_owner: str, repo_name: str):
    """Remove a repository from continuous monitoring and clean up webhooks."""
    uid = _require_uid(request)
    repo_full_name = f"{repo_owner}/{repo_name}"
    access_token = request.session.get("access_token")

    if access_token:
        # Attempt to delete webhook on GitHub
        github_client = GitHubService(token=access_token)
        webhook_url = _get_webhook_url()
        github_client.delete_webhook(repo_name=repo_full_name, callback_url=webhook_url)

    success = firebase_service.remove_monitored_repo(repo_full_name)
    if not success:
        raise HTTPException(500, "Failed to remove repository.")

    return {"status": "removed", "repo": repo_full_name}


# ─── User Settings ────────────────────────────────────────────────────────────

class UserSettingsRequest(BaseModel):
    selected_model: Optional[str] = ""
    monitoring_enabled: Optional[bool] = False
    default_ai_model: Optional[str] = ""
    auto_review_enabled: Optional[bool] = False

@router.get("/settings", summary="Get user settings")
async def get_settings(request: Request):
    """Retrieve persisted user configuration settings."""
    uid = _require_uid(request)
    settings_data = firebase_service.get_user_settings(uid)
    return {"settings": settings_data}


@router.put("/settings", summary="Save user settings")
async def save_settings(request: Request, body: UserSettingsRequest):
    """Persist user configuration settings to Firestore/Mock DB."""
    uid = _require_uid(request)
    success = firebase_service.update_user_settings(uid, body.model_dump())
    if not success:
        raise HTTPException(500, "Failed to save settings.")
    return {"status": "saved"}


# ─── Review History ───────────────────────────────────────────────────────────

@router.get("/reviews", summary="Get review history")
async def get_review_history(request: Request, limit: int = 20):
    """Get recent review records for the current user."""
    uid = _require_uid(request)
    reviews = firebase_service.get_recent_reviews(uid, limit=min(limit, 50))
    return {"reviews": reviews, "count": len(reviews)}


# ─── GitHub Repository List ───────────────────────────────────────────────────

@router.get("/user-repos", summary="List all accessible GitHub repositories")
async def list_user_repos(request: Request):
    """
    Fetch all repositories accessible to the authenticated GitHub user.
    Used by the RepoSelectionModal to show a list of repos the user can monitor.
    Returns: name, full_name, private, language, updated_at, description, stars
    """
    uid = _require_uid(request)
    access_token = request.session.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Active GitHub OAuth session required to list repositories."
        )

    logger.info(f"[Fetching User Repositories] user={uid}")
    github_client = GitHubService(token=access_token)

    try:
        repos = github_client.list_user_repos()
        logger.info(f"[Repositories Loaded] user={uid} count={len(repos)}")
        return {"repos": repos, "count": len(repos)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Error fetching user repos for {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch repositories: {e}")


# ─── Monitoring Config ────────────────────────────────────────────────────────

class MonitoringConfigRequest(BaseModel):
    monitor_all_repositories: bool = Field(default=True, description="Monitor all accessible repos")
    selected_repositories: List[str] = Field(default_factory=list, description="List of owner/repo strings to monitor")
    monitoring_enabled: bool = Field(default=True)


@router.get("/config", summary="Get monitoring configuration")
async def get_monitoring_config(request: Request):
    """Get the current user's monitoring configuration (monitor all vs selected repos)."""
    uid = _require_uid(request)
    try:
        config = firebase_service.get_monitoring_config(uid)
        return {"config": config}
    except Exception as e:
        logger.exception(f"Failed to load monitoring configuration for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load monitoring configuration: {e}",
        )


@router.post("/config", summary="Save monitoring configuration")
async def save_monitoring_config(request: Request, body: MonitoringConfigRequest):
    """
    Save the user's monitoring configuration.
    Called when the user completes the RepoSelectionModal after login.
    """
    uid = _require_uid(request)
    if not firebase_service.is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH "
                "or FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and related service account env vars."
            ),
        )

    access_token = request.session.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Active GitHub OAuth session required.")

    # Store the user's GitHub OAuth token (needed for webhook auto-comments)
    firebase_service.store_github_token(uid, access_token)
    logger.info(f"[Token Store] Saved GitHub OAuth token for user {uid} during monitoring config setup")

    github_client = GitHubService(token=access_token)
    all_repos = github_client.list_user_repos()
    repo_by_name = {repo["full_name"]: repo for repo in all_repos}

    selected_names = sorted(set(body.selected_repositories))
    if not body.monitor_all_repositories:
        invalid = [name for name in selected_names if name not in repo_by_name]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Selected repositories are not accessible with this GitHub account: {', '.join(invalid[:5])}",
            )

    active_repos = all_repos if body.monitor_all_repositories else [repo_by_name[name] for name in selected_names]
    webhook_url = _get_webhook_url()
    webhook_secret = getattr(settings, "WEBHOOK_SECRET", "pr_review_secret_key")

    synced_repos = []
    for repo in active_repos:
        webhook_active = False
        permissions = repo.get("permissions") or {}
        if permissions.get("admin"):
            webhook_active = github_client.create_webhook(
                repo_name=repo["full_name"],
                callback_url=webhook_url,
                secret=webhook_secret,
            )
        else:
            logger.info(
                f"Skipping webhook creation for {repo['full_name']} because the OAuth user lacks admin permission."
            )
        synced_repos.append({**repo, "webhook_active": webhook_active})

    success = firebase_service.save_monitoring_config(
        github_username=uid,
        monitor_all=body.monitor_all_repositories,
        selected_repositories=[] if body.monitor_all_repositories else selected_names,
        monitoring_enabled=body.monitoring_enabled,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to save monitoring configuration.")

    sync_success = firebase_service.sync_monitored_repositories(
        github_username=uid,
        repositories=synced_repos if body.monitoring_enabled else [],
    )
    if not sync_success:
        raise HTTPException(status_code=500, detail="Failed to sync monitored repositories in Firestore.")

    repo_count = "all repositories" if body.monitor_all_repositories else f"{len(selected_names)} repositories"
    logger.info(f"[Monitoring Settings Saved] user={uid} monitoring={repo_count}")

    return {
        "status": "saved",
        "monitor_all": body.monitor_all_repositories,
        "selected_count": len(selected_names),
        "synced_count": len(synced_repos),
        "webhook_active_count": len([r for r in synced_repos if r.get("webhook_active")]),
        "message": f"Now monitoring {repo_count}.",
    }
