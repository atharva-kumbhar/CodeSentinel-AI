"""
AI Review Orchestrator
Central engine that coordinates GitHub fetching, diff processing, and AI analysis.
Supports both Web Dashboard (URL) mode and GitHub Action (raw diff) mode.
Now with multi-LLM support and AI fix generation.
"""

import logging
import time
from typing import List, Optional, Dict, Any
from models.schemas import (
    ReviewResponse, PRReviewRequest, DiffReviewRequest,
    SeverityLevel, LLMConfigRequest, AIFixRequest, AIFixResponse,
)
from services.github_service import GitHubService
from services.diff_processor import DiffProcessor
from services.ai_service import AIService, LLMConfig

logger = logging.getLogger(__name__)


def _to_llm_config(req: Optional[LLMConfigRequest]) -> Optional[LLMConfig]:
    """Convert a Pydantic LLMConfigRequest to the dataclass used by AIService."""
    if not req or not req.provider_id or not req.api_key:
        return None
    return LLMConfig(
        provider_id=req.provider_id,
        api_key=req.api_key,
        base_url=req.base_url or "",
        model=req.model or "",
    )


class ReviewOrchestrator:
    """Central orchestration engine for PR reviews."""

    def __init__(self):
        self.github_service = GitHubService()
        self.diff_processor = DiffProcessor()
        self.ai_service = AIService()

    async def review_from_url(self, request: PRReviewRequest) -> ReviewResponse:
        """
        Web Dashboard Mode: Fetch PR details from GitHub URL, process diff, run AI review.
        If request.github_token is supplied by the user, it takes priority over the env token.
        If request.post_github_review is True, posts the review directly to GitHub as inline comments.
        """
        start_time = time.time()
        logger.info(f"Starting review for PR URL: {request.pr_url}")

        llm_config = _to_llm_config(request.llm_config)

        # Use user-supplied token if provided, otherwise fall back to env-var token
        github_service = (
            GitHubService(token=request.github_token.strip())
            if request.github_token and request.github_token.strip()
            else self.github_service
        )

        # Step 1: Fetch PR details from GitHub
        try:
            pr_details = github_service.get_pr_details(request.pr_url)
        except ValueError as e:
            raise ValueError(str(e))

        # Step 2: Process and optimize the diff
        diff_data = self.diff_processor.process_diff(pr_details["diff_content"])

        if not diff_data["chunks"]:
            return ReviewResponse(
                summary="No reviewable diff content found. The PR may only contain lock files, binary assets, or generated code.",
                issues=[],
                optimized_code="",
                files_analyzed=diff_data["files"],
                review_time_ms=int((time.time() - start_time) * 1000),
            )

        logger.info(self.diff_processor.get_diff_summary(diff_data))

        # Step 3: Run AI review (with optional LLM config)
        review = self.ai_service.review_chunks(
            chunks=diff_data["chunks"],
            repo_name=pr_details["repo_name"],
            pr_title=pr_details["pr_title"],
            pr_body=pr_details.get("pr_body", ""),
            focus_areas=request.focus_areas,
            llm_config=llm_config,
        )

        # Step 4: Apply optional severity threshold filter
        if request.severity_threshold:
            review = self._apply_severity_filter(review, request.severity_threshold)

        # Step 5: Enrich response with metadata
        review.files_analyzed = diff_data["files"]
        review.review_time_ms = int((time.time() - start_time) * 1000)
        review.confidence_score = self._calculate_confidence(diff_data, review)
        review.pr_url = request.pr_url   # stored so frontend can use it for suggestion posting

        # Record which model was used
        if llm_config and llm_config.provider_id:
            from services.ai_service import LLM_PROVIDERS
            provider = LLM_PROVIDERS.get(llm_config.provider_id, {})
            review.model_used = provider.get("name", llm_config.provider_id)
        else:
            review.model_used = "NVIDIA Llama 3.1 70B"

        # Step 6: Post GitHub review comments if requested
        if request.post_github_review:
            try:
                issues_dicts = [i.model_dump() for i in review.issues]
                has_critical = review.critical_count > 0
                gh_result = github_service.post_pr_review(
                    pr_url=request.pr_url,
                    summary=review.summary,
                    issues=issues_dicts,
                    has_critical=has_critical,
                    pr_title=pr_details["pr_title"],
                )
                review.github_review_posted = True
                review.github_review_url    = gh_result.get("html_url")
                review.github_review_event  = gh_result.get("state", "COMMENT")
                logger.info(f"GitHub review posted: {review.github_review_url}")
            except Exception as e:
                logger.warning(f"Failed to post GitHub review: {e}")
                # Don't fail the whole review — just note it wasn't posted

        logger.info(
            f"Review complete: {review.total_issues} issues found in "
            f"{review.review_time_ms}ms."
        )
        return review

    async def review_from_diff(self, request: DiffReviewRequest) -> ReviewResponse:
        """
        GitHub Action CI/CD Mode: Process a raw diff directly without GitHub API call.
        """
        start_time = time.time()
        logger.info(
            f"Starting review for {request.repo_name} PR #{request.pr_number}"
        )

        llm_config = _to_llm_config(request.llm_config)

        # Step 1: Process the provided diff
        diff_data = self.diff_processor.process_diff(request.diff_content)

        if not diff_data["chunks"]:
            return ReviewResponse(
                summary="No reviewable diff content found. The PR may only contain lock files, binary assets, or generated code.",
                issues=[],
                optimized_code="",
                files_analyzed=diff_data["files"],
                review_time_ms=int((time.time() - start_time) * 1000),
            )

        logger.info(self.diff_processor.get_diff_summary(diff_data))

        # Step 2: Run AI review
        review = self.ai_service.review_chunks(
            chunks=diff_data["chunks"],
            repo_name=request.repo_name,
            pr_title=request.pr_title or f"PR #{request.pr_number}",
            pr_body="",
            focus_areas=None,
            llm_config=llm_config,
        )

        # Step 3: Enrich response
        review.files_analyzed = diff_data["files"]
        review.review_time_ms = int((time.time() - start_time) * 1000)
        review.confidence_score = self._calculate_confidence(diff_data, review)

        logger.info(
            f"Review complete: {review.total_issues} issues found in "
            f"{review.review_time_ms}ms."
        )
        return review

    async def generate_fix(self, request: AIFixRequest) -> AIFixResponse:
        """Generate an AI fix for a specific issue."""
        from services.ai_service import AIService
        llm_config = _to_llm_config(request.llm_config)
        client, model = self.ai_service._get_client_and_model(llm_config)

        fix_prompt = f"""You are a senior engineer. Generate a precise code fix for the following issue.

Issue: {request.issue.issue}
File: {request.issue.file}
Line: {request.issue.line}
Severity: {request.issue.severity.value}
Type: {request.issue.type}

Explanation: {request.issue.explanation}

Current suggested fix context: {request.issue.fix}

{f"Surrounding diff context:{chr(10)}{request.diff_context}" if request.diff_context else ""}

Respond ONLY with valid JSON:
{{
  "original_code": "the problematic code snippet",
  "fixed_code": "the corrected code snippet",
  "explanation": "brief explanation of what was changed and why",
  "diff_patch": "unified diff patch showing the change"
}}"""

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a senior engineer generating precise code fixes. Respond with JSON only."},
                    {"role": "user",   "content": fix_prompt},
                ],
                temperature=0.1,
                max_tokens=2048,
            )
            import json, re
            raw = response.choices[0].message.content.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                raw = json_match.group(0)
            data = json.loads(raw)
            return AIFixResponse(
                original_code=data.get("original_code", request.issue.fix),
                fixed_code=data.get("fixed_code", request.issue.fix),
                explanation=data.get("explanation", ""),
                diff_patch=data.get("diff_patch", ""),
            )
        except Exception as e:
            logger.error(f"AI fix generation failed: {e}")
            return AIFixResponse(
                original_code="",
                fixed_code=request.issue.fix,
                explanation=f"Fix generation failed: {str(e)}. Using original suggestion.",
                diff_patch="",
            )

    def _apply_severity_filter(
        self, review: ReviewResponse, threshold: SeverityLevel
    ) -> ReviewResponse:
        """Filter issues below the requested severity threshold."""
        severity_order = {
            SeverityLevel.CRITICAL: 0,
            SeverityLevel.HIGH: 1,
            SeverityLevel.MEDIUM: 2,
            SeverityLevel.LOW: 3,
        }
        threshold_level = severity_order.get(threshold, 3)
        filtered_issues = [
            issue
            for issue in review.issues
            if severity_order.get(issue.severity, 3) <= threshold_level
        ]
        review.issues = filtered_issues
        return review

    def _calculate_confidence(
        self, diff_data: Dict[str, Any], review: ReviewResponse
    ) -> float:
        """
        Calculate a confidence score based on diff characteristics.
        Higher score = more reliable analysis (smaller diff, fewer chunks).
        """
        chunks = diff_data.get("chunks", [])
        files = diff_data.get("files", [])

        base_confidence = 0.92

        # Penalize multi-chunk reviews (less context per chunk)
        chunk_penalty = min(0.10, (len(chunks) - 1) * 0.04) if len(chunks) > 1 else 0.0

        # Small reward for fewer files (more focused diff)
        file_bonus = 0.02 if len(files) <= 3 else 0.0

        confidence = base_confidence - chunk_penalty + file_bonus
        return round(max(0.60, min(0.99, confidence)), 2)

    def get_services_status(self) -> Dict[str, bool]:
        """Check connectivity of all services."""
        return {
            "github": self.github_service.check_connection(),
            "ai_engine": self.ai_service.check_connection(),
        }

    async def test_connection(self, request) -> bool:
        """Test LLM provider connectivity using a supplied config."""
        from services.ai_service import LLMConfig, LLM_PROVIDERS
        provider = LLM_PROVIDERS.get(request.provider_id, {})
        llm_config = LLMConfig(
            provider_id=request.provider_id,
            api_key=request.api_key,
            base_url=request.base_url or provider.get("base_url", ""),
            model=request.model or provider.get("model", ""),
        )
        return self.ai_service.check_connection(llm_config)
