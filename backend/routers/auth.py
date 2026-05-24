"""
Auth Router
GitHub OAuth 2.0 login flow — login, callback, /me, logout.
The access token is ONLY ever stored in the signed HTTP-only session cookie on the server side.
The frontend never receives the raw token.
"""

import secrets
import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from services.auth_service import auth_service
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/github/login", summary="Start GitHub OAuth flow")
def github_login(request: Request):
    """
    Redirect the user to GitHub to authorize the application.
    Generates a CSRF state token stored in the session.
    """
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on this server. "
                   "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.",
        )

    state = secrets.token_urlsafe(16)
    request.session["oauth_state"] = state

    url = auth_service.build_authorization_url(state)
    logger.info("Redirecting to GitHub OAuth authorization.")
    return RedirectResponse(url, status_code=302)


@router.get("/github/callback", summary="GitHub OAuth callback")
def github_callback(
    request:  Request,
    code:     str  = None,
    state:    str  = None,
    error:    str  = None,
):
    """
    GitHub redirects here after user authorizes (or denies) the app.
    Exchanges the code for an access token, stores it in the session,
    then redirects back to the frontend dashboard.
    """
    # Handle user denying the OAuth request
    if error:
        logger.warning(f"OAuth denied by user: {error}")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}?auth=denied",
            status_code=302,
        )

    if not code:
        return RedirectResponse(
            f"{settings.FRONTEND_URL}?auth=error&msg=no_code",
            status_code=302,
        )

    # CSRF state validation
    saved_state = request.session.pop("oauth_state", None)
    if saved_state and state and saved_state != state:
        logger.warning("OAuth state mismatch — possible CSRF attempt.")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}?auth=error&msg=state_mismatch",
            status_code=302,
        )

    try:
        # Exchange authorization code for access token
        access_token = auth_service.exchange_code_for_token(code)

        # Fetch GitHub user info
        user = auth_service.get_github_user(access_token)

        # Store in signed session cookie — token never goes to frontend
        request.session["access_token"] = access_token
        request.session["user_login"]   = user.get("login", "")
        request.session["user_name"]    = user.get("name") or user.get("login", "")
        request.session["user_avatar"]  = user.get("avatar_url", "")
        request.session["user_email"]   = user.get("email", "")

        # Store user settings and encrypted token in Firebase/Mock database
        from services import firebase_service
        firebase_service.upsert_user(
            github_username=user.get("login", ""),
            access_token=access_token,
            email=user.get("email") or "",
            display_name=user.get("name") or user.get("login", ""),
            photo_url=user.get("avatar_url", ""),
        )

        logger.info(f"[GitHub OAuth Success] user={user.get('login')}")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}?auth=success",
            status_code=302,
        )

    except ValueError as e:
        logger.error(f"OAuth callback error: {e}")
        import urllib.parse
        msg = urllib.parse.quote(str(e))
        return RedirectResponse(
            f"{settings.FRONTEND_URL}?auth=error&msg={msg}",
            status_code=302,
        )


@router.get("/me", summary="Get current authenticated user")
def get_current_user(request: Request):
    """
    Returns session-based user info (NO token).
    Used by the frontend to check authentication state on load.
    """
    if "access_token" not in request.session:
        return JSONResponse({"authenticated": False, "user": None})

    return JSONResponse({
        "authenticated": True,
        "user": {
            "login":      request.session.get("user_login", ""),
            "name":       request.session.get("user_name", ""),
            "avatar_url": request.session.get("user_avatar", ""),
            "email":      request.session.get("user_email", ""),
        },
    })


@router.post("/logout", summary="Log out current user")
def logout(request: Request):
    """Clear the session and log the user out."""
    login = request.session.get("user_login", "anonymous")
    request.session.clear()
    logger.info(f"User '{login}' logged out.")
    return JSONResponse({"message": "Logged out successfully."})
