"""
Application Configuration - Settings Management
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "PR Review Assistant"
    ENV: str = "development"
    DEBUG: bool = True

    # API Keys
    NVIDIA_API_KEY: str = ""
    GITHUB_TOKEN: str = ""          # Optional server-side fallback token

    # GitHub OAuth (for private repo support)
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_CALLBACK_URL: str = "http://localhost:8000/api/auth/github/callback"

    # Session (signs HTTP-only cookies — generate with: python -c "import secrets; print(secrets.token_hex(32))")
    SESSION_SECRET_KEY: str = "change-me-to-a-secure-random-secret-in-production"

    # Frontend URL (used for OAuth redirects after login/logout)
    FRONTEND_URL: str = "http://localhost:5173"

    # NVIDIA NIM (default LLM provider)
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "meta/llama-3.1-70b-instruct"

    # Webhook secret (optional — for verifying GitHub webhook signatures)
    WEBHOOK_SECRET: str = ""

    # Public webhook URL for GitHub to call (must be publicly reachable — use ngrok for local dev)
    # Example: https://abc123.ngrok.io/api/review/webhook
    # Leave empty to auto-derive from GITHUB_CALLBACK_URL (only works if deployed publicly)
    WEBHOOK_URL: str = ""

    # CORS — must be explicit (no wildcards) when using credentials/session cookies
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # Review Settings
    MAX_DIFF_TOKENS: int = 12000
    MAX_CHUNK_SIZE: int = 4000
    AI_TEMPERATURE: float = 0.1
    AI_MAX_TOKENS: int = 4096

    # ── Firebase Admin SDK ────────────────────────────────────────────────────
    # Option A: Path to downloaded serviceAccountKey.json
    #   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json
    # Option B: Individual env vars (better for cloud deployments)
    #   FIREBASE_PROJECT_ID=health-app-1b3f9
    #   FIREBASE_PRIVATE_KEY_ID=...
    #   FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
    #   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@health-app-1b3f9.iam.gserviceaccount.com
    #   FIREBASE_CLIENT_ID_SA=...
    #   FIREBASE_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...
    FIREBASE_SERVICE_ACCOUNT_KEY_PATH: str = ""
    FIREBASE_PROJECT_ID: str = "health-app-1b3f9"
    FIREBASE_PRIVATE_KEY_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_CLIENT_ID_SA: str = ""
    FIREBASE_CLIENT_CERT_URL: str = ""

    # Fernet symmetric encryption key for GitHub token storage in Firestore.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If empty, tokens are masked (monitoring features limited).
    FIREBASE_TOKEN_ENCRYPTION_KEY: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
