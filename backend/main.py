"""
AI-Powered GitHub Pull Request Review Assistant
FastAPI Backend - Main Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
import os
from dotenv import load_dotenv

from routers import review, health, auth, monitoring
from config import settings

load_dotenv()

app = FastAPI(
    title="PR Review Assistant API",
    description="AI-powered GitHub Pull Request Review Assistant using NVIDIA NIM",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── Session Middleware (must come BEFORE CORSMiddleware) ──────────────────────
# Uses signed HTTP-only cookies (itsdangerous HMAC).
# The GitHub access token lives only here — never sent to the browser as JSON.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET_KEY,
    session_cookie="pr_review_session",
    max_age=86400,          # 24 hours
    https_only=settings.ENV == "production",   # Secure flag in prod
    same_site="lax",        # Protects against CSRF while allowing OAuth redirects
)

# ── CORS Middleware ───────────────────────────────────────────────────────────
# allow_credentials=True requires explicit origins (no wildcards).
# Add your Vercel URL to ALLOWED_ORIGINS in .env for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,          # Required for session cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,      prefix="/api",              tags=["Health"])
app.include_router(auth.router,        prefix="/api/auth",         tags=["Auth"])
app.include_router(review.router,      prefix="/api/review",       tags=["Review"])
app.include_router(monitoring.router,  prefix="/api/monitoring",   tags=["Monitoring & Firebase"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


@app.get("/")
async def root():
    return {
        "message": "PR Review Assistant API",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/api/docs",
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 7860)),
        reload=os.getenv("ENV", "development") == "development",
        log_level="info",
    )
