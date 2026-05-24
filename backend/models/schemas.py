"""
Pydantic Data Models - Request/Response Schemas
Extended for multi-LLM support, webhooks, and AI fix generation.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from enum import Enum


class SeverityLevel(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class IssueType(str, Enum):
    SECURITY = "Security"
    PERFORMANCE = "Performance"
    BUG = "Bug"
    RELIABILITY = "Reliability"
    MAINTAINABILITY = "Maintainability"
    API_BREAKING = "API Breaking Change"
    CODE_QUALITY = "Code Quality"
    ARCHITECTURE = "Architecture"
    DUPLICATION = "Code Duplication"
    UNSAFE = "Unsafe Pattern"


class Issue(BaseModel):
    severity: SeverityLevel
    type: str
    file: str
    line: int = Field(default=0, ge=0)
    issue: str
    explanation: str
    fix: str


class ReviewResponse(BaseModel):
    model_config = {"protected_namespaces": ()}   # suppress 'model_' namespace warning

    summary: str
    issues: List[Issue]
    optimized_code: str
    confidence_score: float = Field(default=0.85, ge=0.0, le=1.0)
    files_analyzed: List[str] = Field(default_factory=list)
    total_issues: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    review_time_ms: int = 0
    # Scores
    security_score: float = Field(default=100.0, ge=0.0, le=100.0)
    performance_score: float = Field(default=100.0, ge=0.0, le=100.0)
    # GitHub Review posting results
    github_review_posted: bool = False
    github_review_url: Optional[str] = None
    github_review_event: Optional[str] = None   # COMMENT | REQUEST_CHANGES
    # PR metadata (stored for frontend use — e.g. posting suggestions)
    pr_url: Optional[str] = None
    # Active model info
    model_used: Optional[str] = None

    def model_post_init(self, __context):
        self.total_issues   = len(self.issues)
        self.critical_count = sum(1 for i in self.issues if i.severity == SeverityLevel.CRITICAL)
        self.high_count     = sum(1 for i in self.issues if i.severity == SeverityLevel.HIGH)
        self.medium_count   = sum(1 for i in self.issues if i.severity == SeverityLevel.MEDIUM)
        self.low_count      = sum(1 for i in self.issues if i.severity == SeverityLevel.LOW)
        # Calculate scores from issues
        self.security_score = self._calculate_security_score()
        self.performance_score = self._calculate_performance_score()

    def _calculate_security_score(self) -> float:
        sec_issues = [i for i in self.issues if i.type.lower() in ("security", "unsafe pattern")]
        if not sec_issues:
            return 100.0
        penalty = 0
        for i in sec_issues:
            if i.severity == SeverityLevel.CRITICAL: penalty += 30
            elif i.severity == SeverityLevel.HIGH: penalty += 20
            elif i.severity == SeverityLevel.MEDIUM: penalty += 10
            else: penalty += 5
        return max(0.0, 100.0 - penalty)

    def _calculate_performance_score(self) -> float:
        perf_issues = [i for i in self.issues if i.type.lower() == "performance"]
        if not perf_issues:
            return 100.0
        penalty = 0
        for i in perf_issues:
            if i.severity == SeverityLevel.CRITICAL: penalty += 25
            elif i.severity == SeverityLevel.HIGH: penalty += 15
            elif i.severity == SeverityLevel.MEDIUM: penalty += 8
            else: penalty += 3
        return max(0.0, 100.0 - penalty)


# ─── LLM Config (runtime model switching) ──────────────────────────────────

class LLMConfigRequest(BaseModel):
    """Runtime LLM configuration sent by the frontend."""
    provider_id: str = Field(default="", description="Provider ID (e.g., nvidia-llama, deepseek, gpt-4)")
    api_key: str = Field(default="", description="Temporary API key for the selected provider")
    base_url: Optional[str] = Field(default=None, description="Override base URL")
    model: Optional[str] = Field(default=None, description="Override model name")


class PRReviewRequest(BaseModel):
    pr_url: str = Field(..., description="GitHub Pull Request URL")
    github_token: Optional[str] = Field(
        default=None,
        description="User-supplied GitHub Personal Access Token (overrides server env var)"
    )
    post_github_review: bool = Field(
        default=False,
        description="If true, post the AI review as inline comments directly on the GitHub PR"
    )
    focus_areas: Optional[List[str]] = Field(
        default=None,
        description="Specific areas to focus on during review"
    )
    severity_threshold: Optional[SeverityLevel] = Field(
        default=None,
        description="Minimum severity level to report"
    )
    llm_config: Optional[LLMConfigRequest] = Field(
        default=None,
        description="Runtime LLM provider configuration"
    )

    @field_validator("pr_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        if "github.com" not in v or "/pull/" not in v:
            raise ValueError("URL must be a valid GitHub Pull Request URL (e.g., https://github.com/owner/repo/pull/123)")
        return v.strip()


class DiffReviewRequest(BaseModel):
    """For GitHub Action CI/CD mode - receives diff directly"""
    diff_content: str = Field(..., description="Raw git diff content")
    repo_name: str = Field(..., description="Repository name")
    pr_number: int = Field(..., description="Pull Request number")
    pr_title: Optional[str] = Field(default="", description="PR title")
    base_branch: Optional[str] = Field(default="main", description="Base branch name")
    head_branch: Optional[str] = Field(default="", description="Head branch name")
    llm_config: Optional[LLMConfigRequest] = Field(
        default=None,
        description="Runtime LLM provider configuration"
    )


# ─── AI Fix Generation ──────────────────────────────────────────────────────

class AIFixRequest(BaseModel):
    """Request to generate an AI fix for a specific issue."""
    issue: Issue
    file_content: Optional[str] = Field(default=None, description="Full file content for context")
    diff_context: Optional[str] = Field(default=None, description="Surrounding diff context")
    llm_config: Optional[LLMConfigRequest] = Field(default=None)


class AIFixResponse(BaseModel):
    """Response with the generated fix."""
    original_code: str
    fixed_code: str
    explanation: str
    diff_patch: str = ""


# ─── GitHub Suggestion Posting ─────────────────────────────────────────────────

class SuggestionRequest(BaseModel):
    """
    Request to post an AI-generated fix as a native GitHub Suggestion comment
    on a Pull Request. GitHub renders this as an inline 'Apply suggestion' button
    that the PR author can click to apply the fix directly.
    """
    pr_url: str = Field(..., description="GitHub Pull Request URL")
    file_path: str = Field(..., description="File path relative to repo root (e.g. src/app.py)")
    line: int = Field(..., ge=1, description="Line number in the PR diff to attach the suggestion to")
    fixed_code: str = Field(..., description="The corrected code to suggest (will be wrapped in ```suggestion)")
    issue_title: str = Field(default="", description="Issue title to show in comment header")
    issue_explanation: str = Field(default="", description="Brief explanation of the problem")
    severity: str = Field(default="", description="Issue severity (Critical/High/Medium/Low)")
    github_token: Optional[str] = Field(default=None, description="GitHub token override")

    @field_validator("pr_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        if "github.com" not in v or "/pull/" not in v:
            raise ValueError("Must be a valid GitHub Pull Request URL")
        return v.strip()


class SuggestionResponse(BaseModel):
    """Result of posting a suggestion comment to GitHub."""
    success: bool
    comment_url: Optional[str] = None   # URL to the comment on GitHub
    comment_id: Optional[int] = None
    message: str = ""


# ─── Direct Code Push (commit AI fix to PR branch) ────────────────────────────

class PushFixRequest(BaseModel):
    """
    Request to push an AI-generated code fix directly to the PR branch as a commit.
    Replaces the original file content with the fixed version.
    Requires Contents: Read & Write permission on the token.
    """
    pr_url: str = Field(..., description="GitHub Pull Request URL")
    file_path: str = Field(..., description="File path relative to repo root (e.g. src/app.py)")
    fixed_code: str = Field(..., description="The complete corrected file content to commit")
    issue_title: str = Field(default="", description="Issue title (used in commit message)")
    commit_message: str = Field(default="", description="Custom commit message (auto-generated if empty)")
    github_token: Optional[str] = Field(default=None, description="GitHub token override")

    @field_validator("pr_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        if "github.com" not in v or "/pull/" not in v:
            raise ValueError("Must be a valid GitHub Pull Request URL")
        return v.strip()


class PushFixResponse(BaseModel):
    """Result of pushing a code fix commit to the PR branch."""
    success: bool
    commit_url: Optional[str] = None    # URL to the commit on GitHub
    commit_sha: Optional[str] = None    # Short SHA of the new commit
    branch: Optional[str] = None        # Branch the commit was pushed to
    message: str = ""




# ─── LLM Connection Test ──────────────────────────────────────────────────────

class TestConnectionRequest(BaseModel):
    """Request to test connectivity to an LLM provider."""
    provider_id: str = Field(..., description="Provider ID from LLM_PROVIDERS")
    api_key: str = Field(..., description="API key to validate")
    base_url: Optional[str] = Field(default=None)
    model: Optional[str] = Field(default=None)


class TestConnectionResponse(BaseModel):
    """Result of the LLM connection test."""
    success: bool
    message: str


# ─── Webhook ──────────────────────────────────────────────────────────────────

class WebhookPayload(BaseModel):
    """Simplified GitHub webhook payload for PR events."""
    action: str
    number: int
    pull_request: dict
    repository: dict


# ─── Health & Info ────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    services: dict


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class LLMProviderInfo(BaseModel):
    id: str
    name: str
    model: str
    base_url: str
