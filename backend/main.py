"""
AI-Powered GitHub Pull Request Review Assistant
FastAPI Backend - Main Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
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

# Session Middleware
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET_KEY,
    session_cookie="pr_review_session",
    max_age=86400,
    https_only=settings.ENV == "production",
    same_site="lax",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(review.router, prefix="/api/review", tags=["Review"])
app.include_router(
    monitoring.router,
    prefix="/api/monitoring",
    tags=["Monitoring & Firebase"]
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )

# Serve React frontend assets
app.mount(
    "/assets",
    StaticFiles(directory="frontend/dist/assets"),
    name="assets"
)

# Serve React frontend
@app.get("/")
async def serve_frontend():
    return FileResponse("frontend/dist/index.html")

# Health endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "CodeSentinel AI Running"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 7860)),
        reload=False,
        log_level="info",
    )