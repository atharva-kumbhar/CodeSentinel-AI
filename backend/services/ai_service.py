"""
Multi-LLM AI Service
Supports runtime model switching across multiple LLM providers:
  NVIDIA NIM, DeepSeek, OpenAI, Anthropic, Groq (Llama/Mixtral), Qwen (via compatible endpoints).

The caller passes an LLMConfig at review time; if omitted, falls back to env defaults (NVIDIA NIM).
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from openai import OpenAI
from config import settings
from models.schemas import ReviewResponse, Issue, SeverityLevel

logger = logging.getLogger(__name__)

# ─── Master Review Prompt ────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a Principal Engineer, Security Architect, and Staff-Level Code Reviewer with 15+ years of experience reviewing production systems at FAANG-scale companies.

YOUR MISSION:
Perform a real-world production-grade pull request review exactly like a senior engineering review process used inside large-scale software companies.

You are NOT a syntax checker, linter, or compiler.

Even if the code runs successfully, you must deeply analyze the code for:

* Security vulnerabilities
* Performance bottlenecks
* Runtime risks
* Scalability issues
* Concurrency problems
* Maintainability concerns
* Architecture anti-patterns
* Reliability risks
* Code smells
* Technical debt
* Unsafe coding practices
* Memory inefficiencies
* API misuse
* Data validation issues
* Resource leaks
* Error handling failures
* Hidden production risks

CRITICAL REVIEW RULES:

* Think like a real principal engineer approving production code.
* Analyze the code as if it will run at enterprise scale with millions of users.
* Detect subtle issues that static analyzers often miss.
* Prioritize accuracy and grounded analysis over generic warnings.
* Only report issues directly supported by the provided code or PR diff.
* Avoid hallucinating frameworks, libraries, or infrastructure that do not exist in the code.
* Prefer precise actionable engineering feedback.

REVIEW REQUIREMENTS:
You must:

1. Detect ALL possible engineering issues
2. Categorize findings by severity:
   * Critical
   * High
   * Medium
   * Low
3. Explain:
   * Why the issue matters
   * Real-world production impact
   * Possible exploitation/risk
4. Generate practical fixes
5. Suggest safer or more scalable alternatives
6. Think about edge cases and production load
7. Analyze both code correctness and long-term maintainability

GITHUB REVIEW STYLE:
Your findings should read like real GitHub engineering review comments.

Good Example:
"SSL verification is disabled here (`verify=False`), which introduces a potential MITM vulnerability in production environments. This should never be disabled outside local debugging."

Bad Example:
"Insecure code detected."

PERFORMANCE ANALYSIS:
Actively look for:
* O(n²) loops
* Repeated DB/API calls
* Memory waste
* Blocking operations
* Inefficient algorithms
* Unnecessary copies
* Large object retention
* Poor caching strategies

SECURITY ANALYSIS:
Actively look for:
* Hardcoded credentials
* SQL injection
* Command injection
* Unsafe deserialization
* SSRF risks
* XSS risks
* Disabled SSL verification
* Weak authentication logic
* Unsafe file handling
* Sensitive data exposure

RELIABILITY ANALYSIS:
Actively look for:
* Missing error handling
* Resource leaks
* Unclosed files/connections
* Race conditions
* Retry logic failures
* Timeout issues
* Null/None edge cases

════════════════════════════════════════════════════════
MANDATORY CHECKLIST — Review EVERY category below:
════════════════════════════════════════════════════════

🔴 CRITICAL SECURITY (Must block merge):
• Hardcoded secrets: passwords, API keys, tokens, connection strings in source code
• SQL injection: raw string concatenation in queries, f-strings with user input in SQL
• Command injection: subprocess.run/os.system with shell=True + user-controlled input
• Path traversal: user input used in file paths without sanitization
• Disabled SSL/TLS: requests with verify=False, ssl_verify=False
• Unsafe deserialization: pickle.loads(user_data), yaml.load() without SafeLoader
• Authentication bypass: missing auth decorators, JWT not validated
• Sensitive data exposure: passwords/tokens in logs, error messages, API responses
• SSRF: user-controlled URLs fetched server-side without allowlisting
• XSS: user input rendered without escaping in templates

🟠 HIGH — Reliability & Performance:
• Resource leaks: files/DB connections/sockets opened but not closed
• N+1 query: DB queries inside loops
• Unbounded memory: lists/dicts that grow indefinitely without limits
• Missing error handling: external API/DB calls with no try-catch, no timeout
• Race conditions: shared mutable state accessed from multiple threads without locks
• Missing input validation: user-controlled data used directly
• Blocking I/O in async: time.sleep() inside async def
• O(n²) or worse: nested loops over the same dataset

🟡 MEDIUM — Maintainability & Architecture:
• Magic numbers/strings: unexplained numeric literals
• God functions: functions >50 lines doing too many things
• Deep nesting: >3 levels of if/for/try nesting
• Bare exception catches: except: or except Exception as e: pass
• Missing timeouts: HTTP requests, DB connections without timeout
• TODO/FIXME in production code
• Duplicate logic: copy-pasted code
• Hardcoded configuration: environment-specific values not in config/env

🟢 LOW — Code Quality:
• Missing type hints on public functions
• No docstrings on public APIs
• Inconsistent naming conventions
• Unused imports, variables, or dead code
• Overly complex boolean expressions

════════════════════════════════════════════════════════
MANDATORY REQUIREMENTS:
════════════════════════════════════════════════════════
1. Analyze EVERY file in the diff — do not skip any
2. Report MINIMUM 3 issues per PR (even well-written code has improvements)
3. Be SPECIFIC: reference exact variable names, function names, line numbers
4. Line numbers: infer from @@ hunk headers in the diff
5. Every issue MUST have a concrete fix with actual corrected code
6. Do NOT say "the code looks good" — always find real engineering improvements
7. If you find >10 issues, report all of them — do not truncate

OUTPUT: Respond ONLY with valid JSON — no markdown fences, no explanation text outside JSON.

{
  "summary": "3-4 sentence executive summary covering: overall code quality assessment, most critical finding, and main recommendation.",
  "overall_risk": "Critical|High|Medium|Low",
  "issues": [
    {
      "severity": "Critical|High|Medium|Low",
      "type": "Security|Performance|Reliability|Maintainability|Architecture|Code Quality",
      "file": "exact/path/to/file.py",
      "line": 42,
      "issue": "Short title under 80 chars describing the specific problem",
      "explanation": "Detailed technical explanation: what is wrong, why it is dangerous in production",
      "fix": "Complete corrected code snippet showing exactly how to fix this"
    }
  ],
  "optimized_code": "The most important corrected snippet from the diff. Empty string if none.",
  "confidence_score": 0.95
}"""


# ─── Supported Provider Configurations ───────────────────────────────────────

LLM_PROVIDERS = {
    "nvidia-nemotron": {
        "name": "NVIDIA Nemotron",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "nvidia/llama-3.1-nemotron-70b-instruct",
        "max_tokens": 4096,
    },
    "nvidia-llama": {
        "name": "NVIDIA Llama 3.1 70B",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "meta/llama-3.1-70b-instruct",
        "max_tokens": 4096,
    },
    "deepseek": {
        "name": "DeepSeek Coder V2",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-coder",
        "max_tokens": 4096,
    },
    "llama3": {
        "name": "Llama 3 (via Groq)",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama3-70b-8192",
        "max_tokens": 4096,
    },
    "qwen-coder": {
        "name": "Qwen Coder",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-coder-plus",
        "max_tokens": 4096,
    },
    "gpt-4": {
        "name": "GPT-4",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4",
        "max_tokens": 4096,
    },
    "gpt-4o": {
        "name": "GPT-4o",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "max_tokens": 4096,
    },
    "claude": {
        "name": "Claude 3.5 Sonnet",
        "base_url": "https://api.anthropic.com/v1",
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 4096,
        "is_anthropic": True,
    },
    "mixtral": {
        "name": "Mixtral 8x7B (via Groq)",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "mixtral-8x7b-32768",
        "max_tokens": 4096,
    },
}


@dataclass
class LLMConfig:
    """Runtime LLM configuration provided by the caller."""
    provider_id: str = ""
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class AIService:
    """Multi-LLM AI review service with runtime provider switching."""

    def __init__(self):
        # Default client uses NVIDIA NIM from env
        if settings.NVIDIA_API_KEY:
            self.default_client = OpenAI(
                base_url=settings.NVIDIA_BASE_URL,
                api_key=settings.NVIDIA_API_KEY,
            )
        else:
            self.default_client = None
            logger.warning("NVIDIA_API_KEY not set — default AI reviews will fail.")

        self.default_model = settings.NVIDIA_MODEL

    def _get_client_and_model(self, llm_config: Optional[LLMConfig] = None):
        """Resolve the OpenAI-compatible client and model name."""
        if llm_config and llm_config.provider_id and llm_config.api_key:
            provider = LLM_PROVIDERS.get(llm_config.provider_id, {})
            base_url = llm_config.base_url or provider.get("base_url", settings.NVIDIA_BASE_URL)
            model = llm_config.model or provider.get("model", self.default_model)
            client = OpenAI(base_url=base_url, api_key=llm_config.api_key)
            return client, model

        if not self.default_client:
            raise RuntimeError("No AI provider configured. Set NVIDIA_API_KEY or provide a runtime LLM config.")
        return self.default_client, self.default_model

    def review_diff(
        self,
        diff_content: str,
        repo_name:    str = "",
        pr_title:     str = "",
        pr_body:      str = "",
        focus_areas:  Optional[List[str]] = None,
        llm_config:   Optional[LLMConfig] = None,
    ) -> ReviewResponse:
        """Send a processed diff to the selected LLM and parse the review response."""
        client, model = self._get_client_and_model(llm_config)
        user_message = self._build_user_message(diff_content, repo_name, pr_title, pr_body, focus_areas)

        try:
            logger.info(f"Sending diff to AI (model={model})...")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_message},
                ],
                temperature=settings.AI_TEMPERATURE,
                max_tokens=settings.AI_MAX_TOKENS,
                top_p=0.95,
            )
            raw_content = response.choices[0].message.content
            logger.debug(f"Raw AI response (first 500 chars): {raw_content[:500]}")
            return self._parse_response(raw_content)

        except Exception as e:
            logger.error(f"AI API error: {str(e)}")
            raise RuntimeError(f"AI review failed: {str(e)}")

    def review_chunks(
        self,
        chunks:      List[str],
        repo_name:   str = "",
        pr_title:    str = "",
        pr_body:     str = "",
        focus_areas: Optional[List[str]] = None,
        llm_config:  Optional[LLMConfig] = None,
    ) -> ReviewResponse:
        """Review a large diff split into multiple chunks and merge results."""
        if not chunks:
            raise ValueError("No diff chunks to review.")

        if len(chunks) == 1:
            return self.review_diff(chunks[0], repo_name, pr_title, pr_body, focus_areas, llm_config)

        all_issues: List[Issue] = []
        summaries:  List[str]  = []
        optimized_code = ""
        confidence_scores: List[float] = []

        for idx, chunk in enumerate(chunks):
            logger.info(f"Reviewing chunk {idx + 1}/{len(chunks)}...")
            try:
                result = self.review_diff(chunk, repo_name, pr_title, pr_body, focus_areas, llm_config)
                all_issues.extend(result.issues)
                if result.summary:
                    summaries.append(result.summary)
                if result.optimized_code and not optimized_code:
                    optimized_code = result.optimized_code
                confidence_scores.append(result.confidence_score)
            except Exception as e:
                logger.warning(f"Chunk {idx + 1} review failed: {str(e)}")

        # Sort: Critical → High → Medium → Low
        severity_order = {
            SeverityLevel.CRITICAL: 0,
            SeverityLevel.HIGH:     1,
            SeverityLevel.MEDIUM:   2,
            SeverityLevel.LOW:      3,
        }
        all_issues.sort(key=lambda i: severity_order.get(i.severity, 99))

        # De-duplicate
        seen, deduped = set(), []
        for issue in all_issues:
            key = (issue.file, issue.line, issue.type, issue.issue[:30])
            if key not in seen:
                seen.add(key)
                deduped.append(issue)

        merged_summary = (
            " | ".join(summaries)
            if summaries
            else f"Review completed for {repo_name}. {len(deduped)} issue(s) found across {len(chunks)} diff chunk(s)."
        )
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.85

        return ReviewResponse(
            summary=merged_summary,
            issues=deduped,
            optimized_code=optimized_code,
            confidence_score=round(avg_confidence, 2),
        )

    def check_connection(self, llm_config: Optional[LLMConfig] = None) -> bool:
        """Verify AI API connectivity."""
        try:
            client, _ = self._get_client_and_model(llm_config)
            client.models.list()
            return True
        except Exception as e:
            logger.warning(f"AI connection check failed: {e}")
            return False

    @staticmethod
    def get_available_providers() -> List[Dict[str, Any]]:
        """Return the list of supported LLM providers for the frontend."""
        return [
            {
                "id": pid,
                "name": pconfig["name"],
                "model": pconfig["model"],
                "base_url": pconfig["base_url"],
            }
            for pid, pconfig in LLM_PROVIDERS.items()
        ]

    # ─── Private Helpers ──────────────────────────────────────────────────────

    def _build_user_message(
        self,
        diff_content: str,
        repo_name:    str,
        pr_title:     str,
        pr_body:      str,
        focus_areas:  Optional[List[str]],
    ) -> str:
        parts = []
        if repo_name: parts.append(f"Repository: {repo_name}")
        if pr_title:  parts.append(f"PR Title: {pr_title}")
        if pr_body:   parts.append(f"PR Description: {pr_body[:600]}")
        if focus_areas:
            parts.append(f"Priority Focus Areas: {', '.join(focus_areas)}")

        parts.append(
            "\nReview this pull request diff as a senior staff engineer.\n"
            "Apply the FULL checklist from your system instructions.\n"
            "Flag EVERY issue you find — do not skip anything.\n"
            "Infer line numbers from the @@ hunk headers.\n"
        )
        parts.append("=== DIFF START ===")
        parts.append(diff_content)
        parts.append("=== DIFF END ===")
        parts.append(
            "\nIMPORTANT: Respond ONLY with the JSON object. "
            "No markdown. No explanation outside JSON. "
            "Find at least 3 real engineering issues."
        )
        return "\n".join(parts)

    def _parse_response(self, raw_content: str) -> ReviewResponse:
        cleaned = raw_content.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$",          "", cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip()

        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            cleaned = json_match.group(0)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nRaw (first 800): {cleaned[:800]}")
            raise ValueError(f"AI returned invalid JSON. This is a transient error — please retry. ({e})")

        issues = []
        for raw_issue in data.get("issues", []):
            try:
                severity = self._normalize_severity(raw_issue.get("severity", "Low"))
                line_raw = raw_issue.get("line", 0)
                line = int(line_raw) if str(line_raw).isdigit() else 0

                issue = Issue(
                    severity=severity,
                    type=raw_issue.get("type", "Code Quality"),
                    file=raw_issue.get("file", "unknown"),
                    line=max(0, line),
                    issue=raw_issue.get("issue", "Unspecified issue"),
                    explanation=raw_issue.get("explanation", ""),
                    fix=raw_issue.get("fix", ""),
                )
                issues.append(issue)
            except Exception as e:
                logger.warning(f"Skipping malformed issue: {raw_issue} — {e}")

        confidence = float(data.get("confidence_score", 0.85))
        confidence = max(0.0, min(1.0, confidence))

        return ReviewResponse(
            summary=data.get("summary", "Review complete."),
            issues=issues,
            optimized_code=data.get("optimized_code", ""),
            confidence_score=confidence,
        )

    def _normalize_severity(self, severity: str) -> SeverityLevel:
        mapping = {
            "critical": SeverityLevel.CRITICAL,
            "high":     SeverityLevel.HIGH,
            "medium":   SeverityLevel.MEDIUM,
            "med":      SeverityLevel.MEDIUM,
            "low":      SeverityLevel.LOW,
        }
        return mapping.get(severity.strip().lower(), SeverityLevel.LOW)
