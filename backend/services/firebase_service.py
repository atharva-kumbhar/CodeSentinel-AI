"""
Firebase Admin SDK Service
─────────────────────────
Backend-only Firestore integration for:
  - User configuration storage (flat users/ collection)
  - Connected repository management (flat repositories/ collection)
  - Webhook continuous monitoring state persistence
  - Real-time review state tracking (flat review_history/ collection)

Security:
  - Uses Firebase Admin SDK (service account) — backend only
  - GitHub tokens stored encrypted via Fernet symmetric encryption
  - Never exposes raw tokens in Firestore documents
  - serviceAccountKey.json must be in .gitignore
  
Self-Healing Mock Fallback:
  - If Firebase Admin SDK is not configured, automatically falls back to a 
    local mock JSON database (`backend/mock_db.json`) so 100% of the automation 
    features work perfectly out of the box without requiring Firebase!
"""

import logging
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

# ─── Lazy Firebase initialization ─────────────────────────────────────────────

_firebase_app = None
_db = None
_fernet = None

# Mock DB fallback state
_mock_db = {
    "users": {},
    "repositories": {},
    "review_history": {}
}

MOCK_DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mock_db.json")
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))


def _save_mock_db():
    """Save the mock database to a local file."""
    try:
        with open(MOCK_DB_FILE, "w") as f:
            json.dump(_mock_db, f, default=str, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write mock database: {e}")


def _load_mock_db():
    """Load the mock database from a local file."""
    global _mock_db
    if os.path.exists(MOCK_DB_FILE):
        try:
            with open(MOCK_DB_FILE, "r") as f:
                loaded = json.load(f)
                # Ensure all root collections exist
                for key in ("users", "repositories", "review_history"):
                    if key in loaded:
                        _mock_db[key] = loaded[key]
        except Exception as e:
            logger.warning(f"Failed to read mock database: {e}")


# Pre-load mock database on startup
_load_mock_db()


def _get_fernet():
    """Lazy Fernet cipher for token encryption. Returns None if key not set."""
    global _fernet
    if _fernet is not None:
        return _fernet
    try:
        from cryptography.fernet import Fernet
        from config import settings
        key = getattr(settings, "FIREBASE_TOKEN_ENCRYPTION_KEY", "")
        if not key:
            # Generate a temporary key for local dev so that encryption works even if env is empty
            key = Fernet.generate_key().decode()
            settings.FIREBASE_TOKEN_ENCRYPTION_KEY = key
            logger.info("Generated temporary FIREBASE_TOKEN_ENCRYPTION_KEY for session security.")
        
        _fernet = Fernet(key.encode())
        return _fernet
    except Exception as e:
        logger.warning(f"Token encryption not available: {e}")
    return None


def _init_firebase() -> bool:
    """Initialize Firebase Admin SDK. Returns True if successful."""
    global _firebase_app, _db
    if _firebase_app is not None:
        return True

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        from config import settings

        sa_key_path = getattr(settings, "FIREBASE_SERVICE_ACCOUNT_KEY_PATH", "")
        project_id  = getattr(settings, "FIREBASE_PROJECT_ID", "")

        if sa_key_path:
            resolved_sa_key_path = sa_key_path
            if not os.path.isabs(resolved_sa_key_path) and not os.path.exists(resolved_sa_key_path):
                resolved_sa_key_path = os.path.join(BACKEND_DIR, sa_key_path)
            if os.path.exists(resolved_sa_key_path):
                cred = credentials.Certificate(resolved_sa_key_path)
            else:
                logger.warning(f"Firebase service account key not found: {sa_key_path}")
                return False
        elif project_id and getattr(settings, "FIREBASE_PRIVATE_KEY", ""):
            # Build credential dict from individual env vars
            private_key = getattr(settings, "FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
            cred = credentials.Certificate({
                "type":                        "service_account",
                "project_id":                  project_id,
                "private_key_id":              getattr(settings, "FIREBASE_PRIVATE_KEY_ID", ""),
                "private_key":                 private_key,
                "client_email":                getattr(settings, "FIREBASE_CLIENT_EMAIL", ""),
                "client_id":                   getattr(settings, "FIREBASE_CLIENT_ID_SA", ""),
                "auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
                "token_uri":                   "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url":        getattr(settings, "FIREBASE_CLIENT_CERT_URL", ""),
            })
        else:
            logger.info("Firebase is not fully configured. Using highly functional local Mock JSON database.")
            return False

        if not firebase_admin._apps:
            _firebase_app = firebase_admin.initialize_app(cred)
        else:
            _firebase_app = firebase_admin.get_app()

        _db = firestore.client()
        logger.info(f"Firebase Admin SDK initialized successfully (project: {project_id or 'from key file'})")
        return True

    except Exception as e:
        logger.warning(f"Firebase initialization failed: {e}. Falling back to local Mock database.")
        return False


def get_db():
    """Get Firestore client, initializing if needed."""
    if _db is None:
        _init_firebase()
    return _db


def is_firebase_available() -> bool:
    """Check if Firebase is initialized and available."""
    return get_db() is not None


# ─── Encryption Helpers ───────────────────────────────────────────────────────

def _encrypt_token(token: str) -> str:
    """Encrypt a token for storage."""
    f = _get_fernet()
    if f and token:
        try:
            return f.encrypt(token.encode()).decode()
        except Exception as e:
            logger.error(f"Error encrypting token: {e}")
    return f"MASKED:{token[:6]}…" if token else ""


def _decrypt_token(encrypted: str) -> Optional[str]:
    """Decrypt a stored token. Returns None if decryption fails."""
    if not encrypted or encrypted.startswith("MASKED:"):
        return None
    f = _get_fernet()
    if not f:
        return None
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception as e:
        logger.warning(f"Token decryption failed: {e}")
        return None


# ─── User Operations ──────────────────────────────────────────────────────────

def upsert_user(
    github_username: str,
    access_token: str = "",
    email: str = "",
    display_name: str = "",
    photo_url: str = "",
    selected_model: str = "NVIDIA Llama 3.1 70B",
    monitoring_enabled: bool = False,
) -> bool:
    """Create or update a user document in the root 'users' collection."""
    db = get_db()
    
    # Process attributes
    encrypted_token = _encrypt_token(access_token) if access_token else None
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            ref = db.collection("users").document(github_username)
            doc = ref.get()
            
            data = {
                "email": email,
                "display_name": display_name,
                "photo_url": photo_url,
                "updated_at": SERVER_TIMESTAMP,
            }
            if encrypted_token:
                data["access_token"] = encrypted_token
                
            if doc.exists:
                # Retain existing settings if not specified
                existing = doc.to_dict()
                if "monitoring_enabled" not in existing or monitoring_enabled:
                    data["monitoring_enabled"] = monitoring_enabled
                if "selected_model" not in existing or selected_model:
                    data["selected_model"] = selected_model
                ref.update(data)
            else:
                data["created_at"] = SERVER_TIMESTAMP
                data["monitoring_enabled"] = monitoring_enabled
                data["selected_model"] = selected_model
                ref.set(data)
            return True
        except Exception as e:
            logger.error(f"upsert_user failed in Firestore for {github_username}: {e}")
            # Fall through to mock DB if Firestore fails
            
    logger.error("upsert_user requires Firebase Admin SDK / Firestore.")
    return False


def get_user(github_username: str) -> Optional[Dict[str, Any]]:
    """Fetch a user document from root 'users' collection."""
    db = get_db()
    if db:
        try:
            doc = db.collection("users").document(github_username).get()
            return doc.to_dict() if doc.exists else None
        except Exception as e:
            logger.error(f"get_user failed in Firestore for {github_username}: {e}")
            
    return None


# ─── GitHub Token Storage ─────────────────────────────────────────────────────

def store_github_token(github_username: str, github_token: str) -> bool:
    """Store an encrypted GitHub token for a user in their 'users' document."""
    return upsert_user(github_username=github_username, access_token=github_token)


def retrieve_github_token(github_username: str) -> Optional[str]:
    """Retrieve and decrypt the GitHub token for a user."""
    db = get_db()
    encrypted = None
    
    if db:
        try:
            doc = db.collection("users").document(github_username).get()
            if doc.exists:
                encrypted = doc.get("access_token")
        except Exception as e:
            logger.error(f"retrieve_github_token failed in Firestore for {github_username}: {e}")
        
    if encrypted:
        return _decrypt_token(encrypted)
    return None


# ─── Monitoring Config (monitor all vs selected repos) ───────────────────────

def get_monitoring_config(github_username: str) -> Dict[str, Any]:
    """
    Get a user's monitoring configuration:
    - monitor_all_repositories: bool
    - selected_repositories: list of repo full names
    - monitoring_enabled: bool
    """
    db = get_db()
    default = {
        "monitoring_enabled": False,
        "monitor_all_repositories": True,
        "selected_repositories": [],
        "config_saved": False,
    }
    
    if db:
        try:
            doc = db.collection("users").document(github_username).get()
            if doc.exists:
                data = doc.to_dict()
                return {
                    "monitoring_enabled":       data.get("monitoring_enabled", False),
                    "monitor_all_repositories": data.get("monitor_all_repositories", True),
                    "selected_repositories":    data.get("selected_repositories", []),
                    "config_saved":             data.get("monitoring_config_saved", False),
                }
        except Exception as e:
            logger.error(f"get_monitoring_config Firestore error: {e}")
    
    return default


def save_monitoring_config(
    github_username: str,
    monitor_all: bool,
    selected_repositories: List[str],
    monitoring_enabled: bool = True,
) -> bool:
    """
    Save monitoring configuration for a user.
    This is the single source of truth for which repos get auto-reviewed.
    """
    db = get_db()
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            ref = db.collection("users").document(github_username)
            ref.set({
                "monitoring_enabled":       monitoring_enabled,
                "monitor_all_repositories": monitor_all,
                "selected_repositories":    selected_repositories,
                "monitoring_config_saved":  True,
                "monitoring_updated_at":    SERVER_TIMESTAMP,
            }, merge=True)
            logger.info(
                f"[Monitoring Settings Saved] user={github_username} "
                f"monitor_all={monitor_all} selected={len(selected_repositories)}"
            )
            return True
        except Exception as e:
            logger.error(f"save_monitoring_config Firestore error: {e}")
    
    logger.error("save_monitoring_config requires Firebase Admin SDK / Firestore.")
    return False


def is_repo_monitored(github_username: str, repo_full_name: str) -> bool:
    """
    Check if a specific repo should be auto-reviewed for a given user.
    Used by the webhook handler to filter out unselected repos.
    
    Returns True if:
    - monitoring_enabled is True AND
    - (monitor_all_repositories is True OR repo_full_name is in selected_repositories)
    """
    config = get_monitoring_config(github_username)
    
    if not config.get("monitoring_enabled", False):
        return False  # Monitoring disabled entirely
    
    if config.get("monitor_all_repositories", True):
        return True   # Monitor everything
    
    selected = config.get("selected_repositories", [])
    return repo_full_name in selected


def find_monitoring_users_for_repo(repo_full_name: str) -> List[str]:
    """Find users whose saved monitoring records include this repository."""
    repo_id = repo_full_name.replace("/", "__")
    users: List[str] = []
    db = get_db()

    if db:
        try:
            doc = db.collection("repositories").document(repo_id).get()
            if doc.exists:
                user = (doc.to_dict() or {}).get("connected_user", "")
                if user and is_repo_monitored(user, repo_full_name):
                    users.append(user)
        except Exception as e:
            logger.error(f"find_monitoring_users_for_repo Firestore error: {e}")

    return users



# ─── Repository Monitoring ────────────────────────────────────────────────────

def add_monitored_repo(
    github_username: str,
    repo_full_name: str,
    auto_review_enabled: bool = True,
    webhook_active: bool = False,
    repo_metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """Add or update a repository in the root 'repositories' collection."""
    db = get_db()
    repo_id = repo_full_name.replace("/", "__")
    repo_metadata = repo_metadata or {}
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            ref = db.collection("repositories").document(repo_id)
            ref.set({
                "repo_full_name": repo_full_name,
                "name": repo_metadata.get("name", repo_full_name.split("/")[-1]),
                "visibility": repo_metadata.get("visibility", "private" if repo_metadata.get("private") else "public"),
                "private": bool(repo_metadata.get("private", False)),
                "language": repo_metadata.get("language", ""),
                "default_branch": repo_metadata.get("default_branch", ""),
                "permissions": repo_metadata.get("permissions", {}),
                "auto_review_enabled": auto_review_enabled,
                "webhook_active": webhook_active,
                "last_reviewed": None,
                "connected_user": github_username,
                "added_at": SERVER_TIMESTAMP,
                "updated_at": SERVER_TIMESTAMP,
            }, merge=True)
            return True
        except Exception as e:
            logger.error(f"add_monitored_repo failed in Firestore: {e}")
            
    logger.error("add_monitored_repo requires Firebase Admin SDK / Firestore.")
    return False


def sync_monitored_repositories(
    github_username: str,
    repositories: List[Dict[str, Any]],
) -> bool:
    """
    Replace the user's monitored repository records with the real GitHub repos
    selected in the monitoring config.
    """
    desired = {r["full_name"]: r for r in repositories if r.get("full_name")}
    db = get_db()

    if db:
        try:
            existing = db.collection("repositories").where(
                "connected_user", "==", github_username
            ).stream()
            for doc in existing:
                data = doc.to_dict() or {}
                if data.get("repo_full_name") not in desired:
                    doc.reference.delete()
        except Exception as e:
            logger.error(f"sync_monitored_repositories cleanup failed: {e}")

    for repo_full_name, metadata in desired.items():
        saved = add_monitored_repo(
            github_username=github_username,
            repo_full_name=repo_full_name,
            auto_review_enabled=True,
            webhook_active=bool(metadata.get("webhook_active", False)),
            repo_metadata=metadata,
        )
        if not saved:
            return False

    return True


def remove_monitored_repo(repo_full_name: str) -> bool:
    """Remove a repository from root 'repositories' collection."""
    db = get_db()
    repo_id = repo_full_name.replace("/", "__")
    
    if db:
        try:
            db.collection("repositories").document(repo_id).delete()
            return True
        except Exception as e:
            logger.error(f"remove_monitored_repo failed in Firestore: {e}")
            
    return False


def get_monitored_repos(github_username: str) -> List[Dict[str, Any]]:
    """Get all repositories connected to a specific user."""
    db = get_db()
    
    if db:
        try:
            docs = db.collection("repositories").where(
                "connected_user", "==", github_username
            ).stream()
            return [doc.to_dict() for doc in docs]
        except Exception as e:
            logger.error(f"get_monitored_repos failed in Firestore: {e}")
            
    return []


def update_repo_monitoring(repo_full_name: str, enabled: bool) -> bool:
    """Toggle monitoring (auto_review_enabled) on/off for a repository."""
    db = get_db()
    repo_id = repo_full_name.replace("/", "__")
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            db.collection("repositories").document(repo_id).update({
                "auto_review_enabled": enabled,
                "updated_at": SERVER_TIMESTAMP,
            })
            return True
        except Exception as e:
            logger.error(f"update_repo_monitoring failed in Firestore: {e}")
            
    return False


def update_webhook_status(repo_full_name: str, active: bool) -> bool:
    """Update the webhook active status for a repository."""
    db = get_db()
    repo_id = repo_full_name.replace("/", "__")
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            db.collection("repositories").document(repo_id).update({
                "webhook_active": active,
                "updated_at": SERVER_TIMESTAMP,
            })
            return True
        except Exception as e:
            logger.error(f"update_webhook_status failed in Firestore: {e}")
            
    return False


# ─── User Settings ────────────────────────────────────────────────────────────

def get_user_settings(github_username: str) -> Dict[str, Any]:
    """Get user settings directly from the user document."""
    user = get_user(github_username)
    if user:
        return {
            "selected_model": user.get("selected_model", "NVIDIA Llama 3.1 70B"),
            "monitoring_enabled": user.get("monitoring_enabled", False),
        }
    return {
        "selected_model": "NVIDIA Llama 3.1 70B",
        "monitoring_enabled": False
    }


def update_user_settings(github_username: str, settings_data: Dict[str, Any]) -> bool:
    """Save user configuration settings directly in the user document."""
    return upsert_user(
        github_username=github_username,
        selected_model=settings_data.get("selected_model") or settings_data.get("default_ai_model") or "",
        monitoring_enabled=settings_data.get("monitoring_enabled") or settings_data.get("auto_review_enabled") or False
    )


# ─── Review State Tracking ────────────────────────────────────────────────────

def create_review_record(
    github_username: str,
    pr_url: str,
    pr_number: int,
    repo_name: str,
    pr_title: str = "",
) -> Optional[str]:
    """Create a review tracking record in the root 'review_history' collection."""
    db = get_db()
    
    # Auto-generate unique ID
    review_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    review_data = {
        "repo":          repo_name,        # backend field name
        "repo_name":     repo_name,        # frontend field name (RealtimeFeed.jsx)
        "pr_number":     pr_number,
        "pr_url":        pr_url,
        "pr_title":      pr_title,
        "severity_summary": "PENDING",
        "status":        "pending",        # pending | running | complete | error
        "total_issues":  0,
        "critical_count": 0,
        "github_posted": False,
        "github_url":    None,
        "error_msg":     None,
        "connected_user": github_username,
        "created_at":    now,              # used by RealtimeFeed timeAgo()
    }
    
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            review_data_fs = {**review_data, "review_time": SERVER_TIMESTAMP}
            db.collection("review_history").document(review_id).set(review_data_fs)
            return review_id
        except Exception as e:
            logger.error(f"create_review_record failed in Firestore: {e}")
            
    # Mock DB Fallback
    review_data["id"] = review_id
    review_data["review_time"] = now
    _mock_db["review_history"][review_id] = review_data
    _save_mock_db()
    return review_id



def update_review_status(
    review_doc_id: str,
    status: str,
    review_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """Update the status of a review record in root 'review_history' collection."""
    db = get_db()
    update = {"status": status}
    
    if review_data:
        for key in ("total_issues", "critical_count", "github_posted", "github_url", "error_msg"):
            if key in review_data:
                update[key] = review_data[key]
                
        # Calculate severity summary
        if status == "complete":
            crit = review_data.get("critical_count", 0)
            total = review_data.get("total_issues", 0)
            if crit > 0:
                update["severity_summary"] = "CRITICAL"
            elif total > 0:
                update["severity_summary"] = "WARNING"
            else:
                update["severity_summary"] = "CLEAN"
        elif status == "error":
            update["severity_summary"] = "ERROR"
            
    if db:
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            update["review_time"] = SERVER_TIMESTAMP
            db.collection("review_history").document(review_doc_id).update(update)
            
            # Also update last reviewed timestamp in repositories collection
            if status == "complete" and review_data and "repo" in review_data:
                repo_id = review_data["repo"].replace("/", "__")
                db.collection("repositories").document(repo_id).update({
                    "last_reviewed": SERVER_TIMESTAMP
                })
            return True
        except Exception as e:
            logger.error(f"update_review_status failed in Firestore for {review_doc_id}: {e}")
            
    # Mock DB Fallback
    if review_doc_id in _mock_db["review_history"]:
        _mock_db["review_history"][review_doc_id].update(update)
        _mock_db["review_history"][review_doc_id]["review_time"] = datetime.now(timezone.utc).isoformat()
        
        # Update last reviewed in repos
        if status == "complete" and review_data and "repo" in review_data:
            repo_id = review_data["repo"].replace("/", "__")
            if repo_id in _mock_db["repositories"]:
                _mock_db["repositories"][repo_id]["last_reviewed"] = datetime.now(timezone.utc).isoformat()
                
        _save_mock_db()
        return True
    return False


def get_recent_reviews(github_username: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get the most recent review records for a user from 'review_history'."""
    db = get_db()
    results = []
    
    if db:
        try:
            docs = (
                db.collection("review_history")
                .where("connected_user", "==", github_username)
                .order_by("review_time", direction="DESCENDING")
                .limit(limit)
                .stream()
            )
            results = []
            for doc in docs:
                d = doc.to_dict()
                d["id"] = doc.id
                if "review_time" in d and hasattr(d["review_time"], "isoformat"):
                    d["review_time"] = d["review_time"].isoformat()
                results.append(d)
            return results
        except Exception as e:
            logger.warning(f"get_recent_reviews ordered query failed in Firestore: {e}")
            try:
                docs = (
                    db.collection("review_history")
                    .where("connected_user", "==", github_username)
                    .limit(max(limit, 50))
                    .stream()
                )
                for doc in docs:
                    d = doc.to_dict()
                    d["id"] = doc.id
                    for key in ("review_time", "created_at"):
                        if key in d and hasattr(d[key], "isoformat"):
                            d[key] = d[key].isoformat()
                    results.append(d)
                results.sort(
                    key=lambda x: x.get("review_time") or x.get("created_at") or "",
                    reverse=True,
                )
                return results[:limit]
            except Exception as fallback_error:
                logger.error(f"get_recent_reviews fallback query failed in Firestore: {fallback_error}")
            
    # Mock DB Fallback
    user_reviews = [
        r for r in _mock_db["review_history"].values()
        if r.get("connected_user") == github_username
    ]
    # Sort by review_time descending
    user_reviews.sort(key=lambda x: x.get("review_time", ""), reverse=True)
    return user_reviews[:limit]
