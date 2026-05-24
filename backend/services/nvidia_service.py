"""
NVIDIA NIM AI Service
Uses Llama-3.1-70B-Instruct to perform production-grade code reviews
that simulate a senior staff engineer's analysis.
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional
from openai import OpenAI
from config import settings
from models.schemas import ReviewResponse, Issue, SeverityLevel

logger = logging.getLogger(__name__)

# ─── System Prompt ────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a senior staff engineer and security architect with 15+ years of experience at FAANG-level companies.

YOUR MISSION: Perform a real production code review — exactly like a principal engineer would do before approving a PR.

CRITICAL RULE: You are NOT a syntax checker or compiler. Even if the code runs, you must detect:
- Subtle security vulnerabilities that would pass a linter
- Performance traps that only appear at scale
- Engineering anti-patterns that create future technical debt
- Runtime risks that unit tests typically miss

════════════════════════════════════════════════════════
MANDATORY CHECKLIST — Review EVERY category below:
════════════════════════════════════════════════════════

🔴 CRITICAL SECURITY (Must block merge):
• Hardcoded secrets: passwords, API keys, tokens, connection strings in source code
• SQL injection: raw string concatenation in queries, f-strings with user input in SQL
• Command injection: subprocess.run/os.system with shell=True + user-controlled input
• Path traversal: user input used in file paths without sanitization
• Disabled SSL/TLS: requests with verify=False, ssl_verify=False, checkCertificate(false)
• Desecure deserialization: pickle.loads(user_data), yaml.load() without Loader=yaml.SafeLoader
• Authentication bypass: missing @login_required, JWT not validated, session not checked
• Sensitive data exposure: passwords/tokens in logs, error messages, API responses
• SSRF: user-controlled URLs fetched server-side without allowlisting
• XSS: user input rendered without escaping in templates
• Prototype pollution (JS): Object.assign with user input, deep merge without sanitization
• Regex DoS (ReDoS): catastrophic backtracking in regex patterns applied to user input

🟠 HIGH — Reliability & Performance:
• Resource leaks: files/DB connections/sockets opened but not closed (missing with/finally/close)
• N+1 query: DB queries inside loops, ORM queries without select_related/prefetch_related
• Unbounded memory: lists/dicts that grow indefinitely without limits or eviction
• Missing error handling: external API/DB calls with no try-catch, no timeout, no retry
• Race conditions: shared mutable state accessed from multiple threads without locks
• Missing input validation: user-controlled data used directly without type/range/format checks
• Blocking I/O in async: time.sleep(), requests.get() inside async def (should be await asyncio.sleep / httpx)
• O(n²) or worse: nested loops over the same dataset, quadratic string concatenation

🟡 MEDIUM — Maintainability & Architecture:
• Magic numbers/strings: unexplained numeric literals or hardcoded strings (use named constants)
• God functions: functions >50 lines doing too many things (violates SRP)
• Deep nesting: >3 levels of if/for/try nesting (extract to helper functions)
• Bare exception catches: except: or except Exception as e: pass — swallowing errors silently
• Missing timeouts: HTTP requests, DB connections, locks without timeout parameters
• TODO/FIXME in production: leftover development comments
• Duplicate logic: copy-pasted code that should be a shared utility
• Hardcoded configuration: environment-specific values (URLs, ports) not in config/env

🟢 LOW — Code Quality:
• Missing type hints on public functions
• No docstrings on public APIs
• Inconsistent naming (mixing snake_case/camelCase)
• Unused imports, variables, or dead code
• Overly complex boolean expressions
• Missing tests for edge cases (if test files are in the diff)

════════════════════════════════════════════════════════
SPECIFIC PATTERNS TO FLAG (examples):
════════════════════════════════════════════════════════
• `password = "mypassword123"` → Hardcoded credential [Critical/Security]
• `query = f"SELECT * FROM users WHERE id = {user_id}"` → SQL Injection [Critical/Security]
• `requests.get(url, verify=False)` → Disabled SSL verification [Critical/Security]
• `subprocess.run(f"ls {user_input}", shell=True)` → Command Injection [Critical/Security]
• `yaml.load(data)` without SafeLoader → Unsafe deserialization [Critical/Security]
• `for item in items: db.query(...)` → N+1 query problem [High/Performance]
• `open(filename)` without `with` or `.close()` → Resource leak [High/Reliability]
• `except: pass` → Silently swallowed error [High/Reliability]
• `requests.get(url)` without timeout= → Hanging request [Medium/Reliability]
• `time.sleep(5)` inside `async def` → Blocking async event loop [High/Performance]
• Nested loop: O(n²) over large collections → [High/Performance]
• `DEBUG = True` committed to production config → [High/Security]
• Hardcoded IP: `host = "192.168.1.1"` → [Medium/Maintainability]
• `except Exception as e: pass` → Error swallowed [High/Reliability]

════════════════════════════════════════════════════════
MANDATORY REQUIREMENTS:
════════════════════════════════════════════════════════
1. Analyze EVERY file in the diff — do not skip any
2. Report MINIMUM 3 issues per PR (even well-written code has improvements)
3. Be SPECIFIC: reference exact variable names, function names, line numbers
4. Line numbers: infer from @@ hunk headers in the diff (add the offset from the header)
5. Every issue MUST have a concrete fix with actual corrected code
6. Do NOT mention syntax errors unless they also indicate a security/reliability risk
7. Do NOT say "the code looks good" — always find real engineering improvements
8. If you find >10 issues, report all of them — do not truncate

OUTPUT: Respond ONLY with valid JSON — no markdown fences, no explanation text outside JSON.

{
  "summary": "3-4 sentence executive summary covering: overall code quality assessment, most critical finding, and main recommendation. Be specific about what the PR does and what risks it introduces.",
  "overall_risk": "Critical|High|Medium|Low",
  "issues": [
    {
      "severity": "Critical|High|Medium|Low",
      "type": "Security|Performance|Reliability|Maintainability|Architecture|Code Quality",
      "file": "exact/path/to/file.py",
      "line": 42,
      "issue": "Short title under 80 chars describing the specific problem",
      "explanation": "Detailed technical explanation: what is wrong, why it is dangerous/problematic in production, what could go wrong at runtime or under attack",
      "fix": "Complete corrected code snippet showing exactly how to fix this — not a generic suggestion, actual code"
    }
  ],
  "optimized_code": "The most important corrected snippet from the diff — the single fix that has the highest impact. Empty string if no code optimization needed.",
  "confidence_score": 0.95
}"""


class NvidiaService:
    """AI-powered code review using NVIDIA NIM (Llama-3.1-70B-Instruct)."""

    def __init__(self):
        if not settings.NVIDIA_API_KEY:
            logger.warning("NVIDIA_API_KEY not set — AI review will fail.")

        self.client = OpenAI(
            base_url=settings.NVIDIA_BASE_URL,
            api_key=settings.NVIDIA_API_KEY or "dummy-key",
        )
        self.model = settings.NVIDIA_MODEL

    def review_diff(
        self,
        diff_content: str,
        repo_name:    str = "",
        pr_title:     str = "",
        pr_body:      str = "",
        focus_areas:  Optional[List[str]] = None,
    ) -> ReviewResponse:
        """
        Send a processed diff to NVIDIA NIM and parse the structured review response.
        """
        user_message = self._build_user_message(
            diff_content, repo_name, pr_title, pr_body, focus_areas
        )

        try:
            logger.info(f"Sending diff to NVIDIA NIM (model={self.model})...")
            response = self.client.chat.completions.create(
                model=self.model,
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
            logger.error(f"NVIDIA NIM API error: {str(e)}")
            raise RuntimeError(f"AI review failed: {str(e)}")

    def review_chunks(
        self,
        chunks:      List[str],
        repo_name:   str = "",
        pr_title:    str = "",
        pr_body:     str = "",
        focus_areas: Optional[List[str]] = None,
    ) -> ReviewResponse:
        """
        Review a large diff split into multiple chunks.
        Merges results from all chunks into a single consolidated ReviewResponse.
        """
        if not chunks:
            raise ValueError("No diff chunks to review.")

        if len(chunks) == 1:
            return self.review_diff(chunks[0], repo_name, pr_title, pr_body, focus_areas)

        all_issues: List[Issue] = []
        summaries:  List[str]  = []
        optimized_code = ""
        confidence_scores: List[float] = []

        for idx, chunk in enumerate(chunks):
            logger.info(f"Reviewing chunk {idx + 1}/{len(chunks)}...")
            try:
                result = self.review_diff(chunk, repo_name, pr_title, pr_body, focus_areas)
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

        # De-duplicate issues by (file, line, type) to avoid repeats across chunks
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

    def check_connection(self) -> bool:
        """Verify NVIDIA NIM API connectivity with a minimal request."""
        try:
            self.client.models.list()
            return True
        except Exception as e:
            logger.warning(f"NVIDIA NIM connection check failed: {e}")
            return False

    # ─── Private Helpers ──────────────────────────────────────────────────────

    def _build_user_message(
        self,
        diff_content: str,
        repo_name:    str,
        pr_title:     str,
        pr_body:      str,
        focus_areas:  Optional[List[str]],
    ) -> str:
        """Construct the user prompt with diff and PR context."""
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
        """Parse and validate the AI JSON response into a ReviewResponse."""
        cleaned = raw_content.strip()

        # Strip markdown fences if model wraps output in ```json ... ```
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$",          "", cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip()

        # Extract the outermost JSON object if prose surrounds it
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            cleaned = json_match.group(0)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nRaw (first 800): {cleaned[:800]}")
            raise ValueError(
                f"AI returned invalid JSON. This is a transient error — please retry. ({e})"
            )

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
        """Map various severity string representations to SeverityLevel enum."""
        mapping = {
            "critical": SeverityLevel.CRITICAL,
            "high":     SeverityLevel.HIGH,
            "medium":   SeverityLevel.MEDIUM,
            "med":      SeverityLevel.MEDIUM,
            "low":      SeverityLevel.LOW,
        }
        return mapping.get(severity.strip().lower(), SeverityLevel.LOW)
