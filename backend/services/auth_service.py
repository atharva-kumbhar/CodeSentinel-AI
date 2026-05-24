"""
GitHub OAuth Authentication Service
Handles the OAuth 2.0 code → access token exchange and user info retrieval.
The access token is NEVER sent to the frontend — stored only in the signed session cookie.
"""

import logging
import httpx
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger(__name__)

GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL        = "https://api.github.com/user"
GITHUB_AUTHORIZE_URL   = "https://github.com/login/oauth/authorize"


class AuthService:
    """Handles GitHub OAuth token exchange and user info fetching."""

    def build_authorization_url(self, state: str) -> str:
        """Build the GitHub OAuth authorization redirect URL."""
        params = {
            "client_id":    settings.GITHUB_CLIENT_ID,
            "redirect_uri": settings.GITHUB_CALLBACK_URL,
            "scope":        "repo read:user user:email",
            "state":        state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{GITHUB_AUTHORIZE_URL}?{query}"

    def exchange_code_for_token(self, code: str) -> str:
        """
        Exchange the OAuth authorization code for an access token.
        Raises ValueError if the exchange fails.
        """
        if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
            raise ValueError(
                "GitHub OAuth not configured. "
                "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file."
            )

        try:
            resp = httpx.post(
                GITHUB_OAUTH_TOKEN_URL,
                headers={"Accept": "application/json"},
                json={
                    "client_id":     settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code":          code,
                    "redirect_uri":  settings.GITHUB_CALLBACK_URL,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error(f"Token exchange HTTP error: {e}")
            raise ValueError(f"GitHub OAuth token exchange failed: {str(e)}")

        token = data.get("access_token")
        if not token:
            error_desc = data.get("error_description") or data.get("error") or str(data)
            logger.error(f"Token exchange failed: {error_desc}")
            raise ValueError(f"GitHub OAuth error: {error_desc}")

        return token

    def get_github_user(self, access_token: str) -> Dict[str, Any]:
        """
        Fetch the authenticated GitHub user's profile.
        Returns a dict with login, name, avatar_url, email, etc.
        """
        try:
            resp = httpx.get(
                GITHUB_USER_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept":        "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise ValueError("Invalid or expired GitHub access token.")
            raise ValueError(f"Failed to fetch GitHub user info: {e.response.status_code}")
        except httpx.HTTPError as e:
            raise ValueError(f"GitHub API connection error: {str(e)}")

    def validate_token(self, access_token: str) -> bool:
        """Quick check if a stored token is still valid."""
        try:
            self.get_github_user(access_token)
            return True
        except Exception:
            return False


auth_service = AuthService()
