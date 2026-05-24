"""
Review Router
Handles PR review endpoints for both Web Dashboard (URL) and CI/CD (diff) modes.
Includes webhook handler and AI fix generation.
Session token (from GitHub OAuth) takes priority over any manually supplied token.
"""

import logging
import hmac
import hashlib
import json
from fastapi import APIRouter, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from models.schemas import (
    PRReviewRequest,
    DiffReviewRequest,
    ReviewResponse,
    ErrorResponse,
    AIFixRequest,
    AIFixResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    SuggestionRequest,
    SuggestionResponse,
    PushFixRequest,
    PushFixResponse,
)
from services.orchestrator import ReviewOrchestrator
from services.ai_service import AIService
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
orchestrator = ReviewOrchestrator()


def _resolve_token(request: Request, body_token: str | None) -> str | None:
    """
    Token resolution priority:
    1. Session token  (GitHub OAuth — most trusted, stored server-side)
    2. Request body token (user-typed PAT in the UI)
    3. None → orchestrator falls back to env GITHUB_TOKEN
    """
    session_token = request.session.get("access_token")
    if session_token:
        return session_token
    return body_token.strip() if body_token and body_token.strip() else None


@router.post(
    "/url",
    response_model=ReviewResponse,
    summary="Review PR by URL",
    description="Web Dashboard mode: Fetches PR diff from GitHub and runs AI review.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid PR URL or GitHub error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def review_by_url(request: Request, body: PRReviewRequest):
    """
    Receive a GitHub PR URL, fetch its diff via PyGithub,
    process it, and return a structured AI review.
    Session token (OAuth) is used automatically if the user is logged in.
    """
    try:
        effective_token = _resolve_token(request, body.github_token)
        effective_body  = body.model_copy(update={"github_token": effective_token})

        logger.info(
            f"Review requested for: {body.pr_url} "
            f"[auth={'session' if request.session.get('access_token') else 'manual' if body.github_token else 'none'}]"
            f"[llm={body.llm_config.provider_id if body.llm_config else 'default'}]"
        )
        review = await orchestrator.review_from_url(effective_body)
        return review

    except ValueError as e:
        logger.warning(f"Validation/GitHub error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    except RuntimeError as e:
        logger.error(f"AI review runtime error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        logger.exception(f"Unexpected error during URL review: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.post(
    "/diff",
    response_model=ReviewResponse,
    summary="Review PR by Raw Diff",
    description="GitHub Action CI/CD mode: Accepts raw diff and returns AI review.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid diff content"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def review_by_diff(request: Request, body: DiffReviewRequest):
    """
    Receive a raw git diff (from GitHub Actions), process it,
    and return a structured AI review. Used in the CI/CD pipeline.
    """
    try:
        if not body.diff_content.strip():
            raise HTTPException(
                status_code=400,
                detail="diff_content is empty. No reviewable changes found.",
            )

        logger.info(f"CI/CD review for {body.repo_name} PR #{body.pr_number}")
        review = await orchestrator.review_from_diff(body)
        return review

    except HTTPException:
        raise

    except RuntimeError as e:
        logger.error(f"AI review runtime error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        logger.exception(f"Unexpected error during diff review: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.post(
    "/fix",
    response_model=AIFixResponse,
    summary="Generate AI Fix",
    description="Generate an AI-powered code fix for a specific issue.",
)
async def generate_fix(body: AIFixRequest):
    """Generate an AI fix for a detected issue."""
    try:
        result = await orchestrator.generate_fix(body)
        return result
    except Exception as e:
        logger.exception(f"AI fix generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Fix generation failed: {str(e)}")


@router.post(
    "/test-connection",
    response_model=TestConnectionResponse,
    summary="Test LLM Connection",
    description="Verifies if the LLM provider configuration is working.",
)
async def test_connection(body: TestConnectionRequest):
    """Test connection to an LLM provider."""
    try:
        success = await orchestrator.test_connection(body)
        return {"success": success, "message": "Connection successful" if success else "Connection failed"}
    except Exception as e:
        logger.exception(f"Connection test error: {str(e)}")
        return {"success": False, "message": str(e)}


@router.get(
    "/providers",
    summary="List LLM Providers",
    description="Returns the list of supported LLM providers.",
)
async def list_providers():
    """Return available LLM providers for the frontend model selector."""
    providers = AIService.get_available_providers()
    return {"providers": providers}


@router.post(
    "/suggest",
    response_model=SuggestionResponse,
    summary="Post AI Fix as GitHub Suggestion",
    description=(
        "Posts an AI-generated code fix as a native GitHub Suggestion comment on a PR. "
        "GitHub renders this as an inline 'Apply suggestion' button — the PR author can "
        "accept and commit the fix with one click directly on GitHub."
    ),
)
async def post_suggestion(
    request: Request,
    body: SuggestionRequest,
):
    """
    Post an AI fix as a GitHub Pull Request Review Comment with a ```suggestion block.
    The session OAuth token is used first; falls back to body.github_token or GITHUB_TOKEN env var.
    """
    from services.github_service import GitHubService

    # Resolve token: session → body → env
    token = (
        request.session.get("access_token")
        or (body.github_token.strip() if body.github_token and body.github_token.strip() else None)
        or settings.GITHUB_TOKEN.strip()
    )

    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required. Login with GitHub OAuth or provide a token with 'Pull requests: Write' scope.",
        )

    github_service = GitHubService(token=token)

    try:
        result = github_service.post_suggestion_comment(
            pr_url=body.pr_url,
            file_path=body.file_path,
            line=body.line,
            fixed_code=body.fixed_code,
            issue_title=body.issue_title,
            issue_explanation=body.issue_explanation,
            severity=body.severity,
        )
        logger.info(
            f"Suggestion posted: {result.get('comment_url')} "
            f"(file={body.file_path} line={body.line})"
        )
        return SuggestionResponse(
            success=True,
            comment_url=result.get("comment_url"),
            comment_id=result.get("comment_id"),
            message="Suggestion posted to GitHub successfully!",
        )
    except ValueError as e:
        logger.warning(f"Suggestion post failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error posting suggestion: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to post suggestion: {e}")


@router.post(
    "/push-fix",
    response_model=PushFixResponse,
    summary="Push AI Fix directly to PR branch",
    description=(
        "Commits an AI-generated code fix directly to the PR's head branch. "
        "This replaces the original file with the fixed version and creates a commit "
        "on GitHub — visible immediately in the PR diff and timeline. "
        "Requires 'Contents: Read & Write' token permission."
    ),
)
async def push_fix_to_branch(
    request: Request,
    body: PushFixRequest,
):
    """
    Commit an AI-generated fix directly to the PR head branch.
    Session OAuth token is used first; falls back to body.github_token or GITHUB_TOKEN env var.
    """
    from services.github_service import GitHubService

    # Resolve token: session → body → env
    token = (
        request.session.get("access_token")
        or (body.github_token.strip() if body.github_token and body.github_token.strip() else None)
        or settings.GITHUB_TOKEN.strip()
    )

    if not token:
        raise HTTPException(
            status_code=401,
            detail=(
                "GitHub token required to push commits. "
                "Login with GitHub OAuth or provide a token with 'Contents: Read & Write' scope."
            ),
        )

    github_service = GitHubService(token=token)

    try:
        result = github_service.push_file_fix(
            pr_url=body.pr_url,
            file_path=body.file_path,
            fixed_code=body.fixed_code,
            issue_title=body.issue_title,
            commit_message=body.commit_message,
        )
        logger.info(
            f"Push-fix commit {result.get('commit_sha')} → {result.get('branch')} "
            f"(file={body.file_path})"
        )
        return PushFixResponse(
            success=True,
            commit_url=result.get("commit_url"),
            commit_sha=result.get("commit_sha"),
            branch=result.get("branch"),
            message=f"Fix committed to branch '{result.get('branch')}' as {result.get('commit_sha')}",
        )
    except ValueError as e:
        logger.warning(f"Push-fix failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in push-fix: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to push fix: {e}")


async def _run_webhook_review(
    pr_url: str,
    repo_name: str,
    pr_number: int,
    github_username: str = "",
):
    """
    Background task: runs the full AI review pipeline for a webhook-triggered PR event.

    Flow:
      1. Resolve GitHub token (per-user stored token → env GITHUB_TOKEN fallback)
      2. Create a 'running' review record in the database (visible on dashboard)
      3. Fetch PR diff from GitHub API
      4. Run AI review
      5. Post review comments to GitHub PR
      6. Update review record to 'complete' or 'error'
    """
    from services import firebase_service as fb

    print(f"\n{'='*60}")
    print(f"[Webhook Event Received] PR event for: {repo_name} PR #{pr_number}")
    print(f"[Webhook Event Received] PR URL: {pr_url}")
    print(f"{'='*60}")

    # ── Repo Selection Check ─────────────────────────────────────────────────
    if github_username and not fb.is_repo_monitored(github_username, repo_name):
        print(f"[Webhook Filter] Skipping PR for {repo_name} — repo is not selected for monitoring by @{github_username}.")
        return
    if github_username:
        print(f"[Repository Match Found] user={github_username} repo={repo_name}")


    # ── Step 1: Resolve GitHub token ─────────────────────────────────────────
    print(f"[Auth] Resolving GitHub token...")

    github_token = None

    # Try 1: retrieve stored OAuth token for this user from the database
    if github_username:
        github_token = fb.retrieve_github_token(github_username)
        if github_token:
            print(f"[Auth] ✅ Using stored OAuth token for user: {github_username}")
        else:
            print(f"[Auth] ⚠️  No stored token found for user: {github_username}")

    # Try 2: fall back to server-side GITHUB_TOKEN env var
    if not github_token:
        github_token = settings.GITHUB_TOKEN.strip() if settings.GITHUB_TOKEN else ""
        if github_token:
            print(f"[Auth] ✅ Using GITHUB_TOKEN from environment")
        else:
            print(f"[Auth] ❌ No GitHub token available!")
            print(f"[Auth]    Set GITHUB_TOKEN in backend/.env with 'repo' scope")
            print(f"[Auth]    Webhook review ABORTED — cannot fetch PR or post review without a token")
            # Create an error record so the dashboard shows the failure
            review_id = fb.create_review_record(
                github_username=github_username or "system",
                pr_url=pr_url,
                pr_number=pr_number,
                repo_name=repo_name,
                pr_title=f"PR #{pr_number}",
            )
            if review_id:
                fb.update_review_status(review_id, "error", {
                    "error_msg": "GITHUB_TOKEN not configured. Set it in backend/.env with 'repo' scope.",
                    "repo": repo_name,
                })
            return

    # ── Step 2: Create review record (status=running) ────────────────────────
    print(f"[DB] Creating review record (status=running)...")
    review_id = fb.create_review_record(
        github_username=github_username or "system",
        pr_url=pr_url,
        pr_number=pr_number,
        repo_name=repo_name,
        pr_title=f"PR #{pr_number}",  # will be updated after fetching PR details
    )
    if review_id:
        print(f"[DB] ✅ Review record created: {review_id}")
        fb.update_review_status(review_id, "running")
    else:
        print(f"[DB] ⚠️  Failed to create review record (dashboard will not update)")

    # ── Step 3–6: Run the full review pipeline ───────────────────────────────
    try:
        print(f"[PR Event Detected] action=synchronize/opened  repo={repo_name}  PR=#{pr_number}")
        print(f"[Fetching Diff] Contacting GitHub API...")

        review_request = PRReviewRequest(
            pr_url=pr_url,
            github_token=github_token,
            post_github_review=True,
        )

        print(f"[Running AI Review] Sending diff to NVIDIA NIM AI engine...")
        review = await orchestrator.review_from_url(review_request)
        print(f"[AI Review Triggered] repo={repo_name} pr={pr_number}")

        print(f"[AI Complete] Found {review.total_issues} issues ({review.critical_count} critical)")
        print(f"[Generating Comments] Formatting review for GitHub...")

        if review.github_review_posted:
            print(f"[Posting GitHub Review] ✅ Review posted successfully!")
            print(f"[Review Posted Successfully] URL: {review.github_review_url}")
        else:
            print(f"[Posting GitHub Review] ⚠️  Review was not posted to GitHub (check token permissions)")

        # ── Step 6: Update review record to 'complete' ──────────────────────
        if review_id:
            fb.update_review_status(review_id, "complete", {
                "total_issues":  review.total_issues,
                "critical_count": review.critical_count,
                "github_posted": review.github_review_posted,
                "github_url":   review.github_review_url,
                "repo":          repo_name,
            })
            print(f"[DB] ✅ Review record updated to 'complete'")

        print(f"[Webhook Complete] Background review finished for {repo_name} PR #{pr_number}")
        print(f"{'='*60}\n")

    except Exception as e:
        import traceback
        print(f"\n[ERROR] Background webhook review FAILED for {repo_name} PR #{pr_number}")
        print(f"[ERROR] Exception: {type(e).__name__}: {e}")
        print(f"[ERROR] Full traceback:")
        print(traceback.format_exc())
        print(f"{'='*60}\n")

        logger.error(
            f"[Webhook ERROR] {repo_name} PR #{pr_number}: {type(e).__name__}: {e}",
            exc_info=True,
        )

        # Update review record to 'error' so dashboard shows the failure
        if review_id:
            fb.update_review_status(review_id, "error", {
                "error_msg": f"{type(e).__name__}: {str(e)[:200]}",
                "repo": repo_name,
            })


@router.post(
    "/webhook",
    summary="GitHub Webhook Handler",
    description="Handles incoming GitHub webhook events for automatic PR review.",
)
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_github_event: str = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
):
    """
    Handle GitHub webhook events.
    Triggered when PRs are opened, synchronized, or reopened.
    Validates the webhook signature and triggers an automatic review.
    """
    body_bytes = await request.body()

    print(f"\n[Webhook Event Received] Incoming GitHub event: {x_github_event}")

    # ── Signature Validation ──────────────────────────────────────────────────
    webhook_secret = getattr(settings, 'WEBHOOK_SECRET', '')
    if webhook_secret and x_hub_signature_256:
        expected_sig = "sha256=" + hmac.new(
            webhook_secret.encode(), body_bytes, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, x_hub_signature_256):
            print(f"[Webhook] ❌ Signature mismatch — request rejected")
            logger.warning("Webhook signature mismatch — rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid webhook signature.")
        print(f"[Webhook] ✅ Signature validated")
    elif webhook_secret and not x_hub_signature_256:
        print(f"[Webhook] ⚠️  WEBHOOK_SECRET is set but no signature header received")
    else:
        print(f"[Webhook] ℹ️  Signature validation skipped (WEBHOOK_SECRET not set)")

    payload = json.loads(body_bytes)
    action = payload.get("action", "")

    # ── Manual PR comment trigger ────────────────────────────────────────────
    if x_github_event == "issue_comment":
        issue = payload.get("issue", {})
        comment = payload.get("comment", {})
        comment_body = (comment.get("body") or "").strip().lower()
        if action != "created" or "pull_request" not in issue:
            return JSONResponse({"status": "ignored", "event": x_github_event, "action": action})
        if comment_body not in ("/review", "/ai-review", "review"):
            print("[Webhook] Ignoring PR comment. Use /review to trigger an AI review.")
            return JSONResponse({"status": "ignored", "reason": "comment_not_review_trigger"})

        repo = payload.get("repository", {})
        repo_name = repo.get("full_name", "")
        pr_number = issue.get("number", 0)
        pr_url = issue.get("html_url", "")

        if not repo_name or not pr_url:
            raise HTTPException(status_code=400, detail="Missing PR data in issue_comment payload.")

        from services import firebase_service as fb
        matched_users = fb.find_monitoring_users_for_repo(repo_name)
        github_username = matched_users[0] if matched_users else ""
        if not github_username:
            print(f"[Webhook Filter] Ignoring {repo_name} — repository is not selected for monitoring.")
            return JSONResponse({"status": "ignored", "reason": "repository_not_monitored", "repo": repo_name})

        print(f"[Repository Match Found] repo={repo_name} user={github_username}")
        print(f"[AI Review Triggered] repo={repo_name} pr={pr_number} source=comment")
        background_tasks.add_task(
            _run_webhook_review,
            pr_url,
            repo_name,
            pr_number,
            github_username,
        )
        return JSONResponse(
            status_code=202,
            content={
                "status": "accepted",
                "message": f"AI review triggered for {repo_name} PR #{pr_number}",
            },
        )

    # ── Filter Events ─────────────────────────────────────────────────────────
    if x_github_event != "pull_request":
        print(f"[Webhook] Ignoring non-PR event: {x_github_event}")
        return JSONResponse({"status": "ignored", "event": x_github_event})

    if action not in ("opened", "synchronize", "reopened"):
        print(f"[Webhook] Ignoring PR action: {action} (not a reviewable event)")
        return JSONResponse({"status": "ignored", "action": action})

    # ── Extract PR Data ───────────────────────────────────────────────────────
    pr   = payload.get("pull_request", {})
    repo = payload.get("repository", {})
    pr_number = pr.get("number", 0)
    repo_name = repo.get("full_name", "")
    pr_url    = pr.get("html_url", "")

    if not pr_url:
        raise HTTPException(status_code=400, detail="Missing PR URL in webhook payload.")

    # ── Resolve monitored user for this repo (to get their OAuth token) ───────
    from services import firebase_service as fb
    github_username = ""
    try:
        matched_users = fb.find_monitoring_users_for_repo(repo_name)
        github_username = matched_users[0] if matched_users else ""
        if github_username:
            print(f"[Repository Match Found] repo={repo_name} user={github_username}")
        else:
            print(f"[Webhook Filter] Ignoring {repo_name} — repository is not selected for monitoring.")
            return JSONResponse({"status": "ignored", "reason": "repository_not_monitored", "repo": repo_name})
    except Exception as lookup_err:
        print(f"[Webhook] User lookup failed: {lookup_err}")
        return JSONResponse({"status": "ignored", "reason": "monitoring_lookup_failed", "repo": repo_name})

    print(f"[Webhook] Queuing background review: {action} — {repo_name} PR #{pr_number}")
    print(f"[AI Review Triggered] repo={repo_name} pr={pr_number}")
    logger.info(f"Webhook: {action} — {repo_name} PR #{pr_number}")

    background_tasks.add_task(
        _run_webhook_review,
        pr_url,
        repo_name,
        pr_number,
        github_username,
    )

    return JSONResponse(
        status_code=202,
        content={
            "status": "accepted",
            "message": f"AI review triggered for {repo_name} PR #{pr_number}",
        },
    )
