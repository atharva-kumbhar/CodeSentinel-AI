"""
GitHub API Integration Service
Handles fetching PR data, diffs, and posting structured review comments
back to GitHub using the Pull Requests Review API.
"""

import re
import logging
import httpx
from typing import Tuple, Optional, Dict, Any, List
from github import Github, GithubException
from config import settings

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"


class GitHubService:
    def __init__(self, token: Optional[str] = None):
        self.token = token or settings.GITHUB_TOKEN
        # Always set a timeout — unauthenticated PyGithub can hang indefinitely
        if self.token:
            self.client = Github(self.token, timeout=30, retry=None)
        else:
            self.client = Github(timeout=30, retry=None)

    # ─── PR Data Fetching ─────────────────────────────────────────────────────

    def parse_pr_url(self, pr_url: str) -> Tuple[str, int]:
        """Extract owner/repo and PR number from GitHub URL."""
        pattern = r"github\.com/([^/]+/[^/]+)/pull/(\d+)"
        match = re.search(pattern, pr_url)
        if not match:
            raise ValueError(f"Invalid GitHub PR URL: {pr_url}")
        return match.group(1), int(match.group(2))

    def get_pr_details(self, pr_url: str) -> Dict[str, Any]:
        """Fetch complete PR details including diff."""
        repo_name, pr_number = self.parse_pr_url(pr_url)

        try:
            repo = self.client.get_repo(repo_name)
            pr   = repo.get_pull(pr_number)

            files      = pr.get_files()
            diff_parts = []
            changed_files = []

            for file in files:
                if file.patch:
                    diff_parts.append(
                        f"--- a/{file.filename}\n"
                        f"+++ b/{file.filename}\n"
                        f"{file.patch}"
                    )
                    changed_files.append({
                        "filename":  file.filename,
                        "status":    file.status,
                        "additions": file.additions,
                        "deletions": file.deletions,
                        "changes":   file.changes,
                    })

            return {
                "repo_name":           repo_name,
                "pr_number":           pr_number,
                "pr_title":            pr.title,
                "pr_body":             pr.body or "",
                "base_branch":         pr.base.ref,
                "head_branch":         pr.head.ref,
                "head_sha":            pr.head.sha,
                "author":              pr.user.login,
                "state":               pr.state,
                "is_private":          repo.private,
                "diff_content":        "\n".join(diff_parts),
                "changed_files":       changed_files,
                "total_additions":     pr.additions,
                "total_deletions":     pr.deletions,
                "total_changed_files": pr.changed_files,
            }

        except GithubException as e:
            logger.error(f"GitHub API error: {e.status} - {e.data}")
            if e.status == 404:
                if not self.token:
                    raise ValueError(
                        f"PR not found or repository is private: {pr_url}\n"
                        "→ This repo may be private. Login with GitHub (top-right) to review private repos, "
                        "or enter a Personal Access Token with 'repo' scope."
                    )
                raise ValueError(
                    f"PR not found: {pr_url}\n"
                    "→ Check the URL is correct and your token has access to this repo."
                )
            elif e.status == 403:
                raise ValueError(
                    "GitHub API rate limit exceeded or insufficient permissions.\n"
                    "→ Login with GitHub OAuth or add a token with 'repo' scope."
                )
            elif e.status == 401:
                raise ValueError(
                    "GitHub token is invalid or expired.\n"
                    "→ Generate a new token at https://github.com/settings/tokens with 'repo' scope."
                )
            else:
                raise ValueError(
                    f"GitHub API error ({e.status}): {e.data.get('message', 'Unknown error')}"
                )
        except Exception as e:
            err_str = str(e)
            if "timed out" in err_str.lower() or "timeout" in err_str.lower():
                raise ValueError(
                    "GitHub API request timed out. Check your internet connection and try again."
                )
            logger.error(f"Error fetching PR: {err_str}")
            raise ValueError(f"Failed to fetch PR details: {err_str}")

    # ─── GitHub Review API ────────────────────────────────────────────────────

    def post_pr_review(
        self,
        pr_url:     str,
        summary:    str,
        issues:     List[Dict[str, Any]],
        has_critical: bool,
        pr_title:   str = "",
    ) -> Dict[str, Any]:
        """
        Post a structured AI review directly to the GitHub Pull Request
        using the GitHub REST Pull Request Reviews API.

        Creates:
        - A review body with the full summary and issue table
        - Inline review comments for each issue that has a file + line number
        - Review event: REQUEST_CHANGES if critical issues exist, else COMMENT

        Returns the GitHub API response (includes html_url of the posted review).
        """
        if not self.token:
            raise ValueError(
                "A GitHub token is required to post review comments. "
                "Login with GitHub OAuth or supply a token with 'repo' scope."
            )

        repo_name, pr_number = self.parse_pr_url(pr_url)
        owner, repo = repo_name.split("/", 1)

        # Build inline comments for issues with known file + line
        inline_comments = []
        for issue in issues:
            file_path = issue.get("file", "")
            line      = issue.get("line", 0)
            if file_path and file_path not in ("unknown", "") and isinstance(line, int) and line > 0:
                inline_comments.append({
                    "path": file_path,
                    "line": line,
                    "side": "RIGHT",
                    "body": self._format_inline_comment(issue),
                })

        review_body = self._format_review_body(summary, issues, pr_title)
        event       = "REQUEST_CHANGES" if has_critical else "COMMENT"

        payload = {
            "body":     review_body,
            "event":    event,
            "comments": inline_comments,
        }

        url     = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}/reviews"
        headers = {
            "Authorization":        f"Bearer {self.token}",
            "Accept":               "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code == 422:
                # Inline comment positions failed — retry with body-only review
                logger.warning("Inline comments failed (422). Retrying with body-only review.")
                payload["comments"] = []
                resp = httpx.post(url, json=payload, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            detail = e.response.text[:300]
            if status == 403:
                raise ValueError("Insufficient token permissions. Ensure the token has 'repo' scope.")
            elif status == 404:
                raise ValueError(f"Pull request not found: {pr_url}")
            elif status == 401:
                raise ValueError("GitHub token is invalid or expired.")
            raise ValueError(f"GitHub Review API error ({status}): {detail}")
        except httpx.HTTPError as e:
            raise ValueError(f"GitHub API connection error: {str(e)}")

    def post_suggestion_comment(
        self,
        pr_url: str,
        file_path: str,
        line: int,
        fixed_code: str,
        issue_title: str = "",
        issue_explanation: str = "",
        severity: str = "",
    ) -> Dict[str, Any]:
        """
        Post an AI-generated fix as a native GitHub Suggestion comment.

        GitHub renders these as inline "Apply suggestion" buttons on the PR —
        the PR author can accept and commit the fix with a single click, directly
        on GitHub without touching their local repo.

        Uses: POST /repos/{owner}/{repo}/pulls/{pr_number}/comments
        Requires: pull_request Write permission on the token.

        Returns dict with: comment_url, comment_id, html_url
        """
        if not self.token:
            raise ValueError(
                "GitHub token required to post suggestion comments. "
                "Login with GitHub OAuth or set GITHUB_TOKEN in .env"
            )

        repo_name, pr_number = self.parse_pr_url(pr_url)
        owner, repo = repo_name.split("/", 1)

        # ── Step 1: Get the PR head commit SHA (required by GitHub API) ────────
        try:
            pr_obj = self.client.get_repo(repo_name).get_pull(pr_number)
            commit_sha = pr_obj.head.sha
        except Exception as e:
            raise ValueError(f"Failed to fetch PR head commit SHA: {e}")

        # ── Step 2: Format the suggestion comment body ─────────────────────────
        severity_emoji = {
            "Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🟢"
        }.get(severity, "🔵")

        body_lines = ["## 🤖 AI Suggested Fix"]
        if issue_title:
            body_lines.append(f"\n**{severity_emoji} [{severity}]** {issue_title}" if severity else f"\n**Issue:** {issue_title}")
        if issue_explanation:
            body_lines.append(f"\n{issue_explanation}")
        body_lines.append(f"\n```suggestion\n{fixed_code}\n```")
        body_lines.append("\n---\n*🤖 Suggested by [PR Review Assistant](https://github.com) · NVIDIA NIM AI*")
        body = "\n".join(body_lines)

        # ── Step 3: Post the inline suggestion via GitHub REST API ─────────────
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}/comments"
        headers = {
            "Authorization":        f"Bearer {self.token}",
            "Accept":               "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        payload = {
            "body":      body,
            "commit_id": commit_sha,
            "path":      file_path,
            "line":      line,
            "side":      "RIGHT",
        }

        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code == 422:
                # Line not in diff — fall back to general PR comment
                logger.warning(
                    f"Line {line} of {file_path} is not in the PR diff (422). "
                    "Posting as a general PR comment instead."
                )
                fallback_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/comments"
                fallback_body = body.replace(
                    f"```suggestion\n{fixed_code}\n```",
                    f"**Suggested fix** (line {line} not in diff — shown as code block):\n"
                    f"```\n{fixed_code}\n```"
                )
                resp = httpx.post(fallback_url, json={"body": fallback_body}, headers=headers, timeout=30)
            resp.raise_for_status()
            result = resp.json()
            return {
                "comment_url": result.get("html_url"),
                "comment_id":  result.get("id"),
                "html_url":    result.get("html_url"),
            }
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            detail = e.response.text[:300]
            if status == 403:
                raise ValueError("Token lacks 'Pull requests: Write' permission.")
            elif status == 401:
                raise ValueError("GitHub token is invalid or expired.")
            elif status == 404:
                raise ValueError(f"PR not found: {pr_url}")
            raise ValueError(f"GitHub API error ({status}): {detail}")
        except httpx.HTTPError as e:
            raise ValueError(f"GitHub connection error: {e}")

    def push_file_fix(
        self,
        pr_url: str,
        file_path: str,
        fixed_code: str,
        issue_title: str = "",
        commit_message: str = "",
    ) -> Dict[str, Any]:
        """
        Directly commit an AI-generated code fix to the PR's head branch.

        This replaces the file at `file_path` with `fixed_code` and creates
        a new commit on the PR branch — visible immediately in the PR diff.

        Requires: Contents Read & Write permission on the token.

        Returns dict with: commit_url, commit_sha, branch
        """
        if not self.token:
            raise ValueError(
                "GitHub token required to push code commits. "
                "Login with GitHub OAuth or set GITHUB_TOKEN with 'Contents: Write' scope."
            )

        repo_name, pr_number = self.parse_pr_url(pr_url)

        try:
            repo = self.client.get_repo(repo_name)
            pr   = repo.get_pull(pr_number)
            branch = pr.head.ref  # PR head branch (e.g. "feature/my-fix")

            # Build commit message
            if not commit_message:
                title = issue_title or file_path
                commit_message = f"fix: AI-suggested fix for '{title}' in {file_path}"

            # Get current file to retrieve its SHA (required by GitHub update API)
            try:
                current_file = repo.get_contents(file_path, ref=branch)
                file_sha = current_file.sha
            except GithubException as e:
                if e.status == 404:
                    raise ValueError(
                        f"File '{file_path}' not found in branch '{branch}'. "
                        "The file path must match exactly (case-sensitive, relative to repo root)."
                    )
                raise

            # Commit the fixed code to the PR branch
            result = repo.update_file(
                path=file_path,
                message=commit_message,
                content=fixed_code,
                sha=file_sha,
                branch=branch,
            )

            commit = result["commit"]
            commit_sha = commit.sha[:7]  # short SHA
            commit_url = commit.html_url

            logger.info(
                f"Pushed fix commit {commit_sha} to {repo_name}:{branch} "
                f"(file={file_path}, issue='{issue_title}')"
            )

            return {
                "commit_url": commit_url,
                "commit_sha": commit_sha,
                "branch":     branch,
            }

        except GithubException as e:
            logger.error(f"GitHub push error: {e.status} - {e.data}")
            if e.status == 403:
                raise ValueError(
                    "Permission denied. Your token needs 'Contents: Read & Write' scope to push commits. "
                    "Update your token permissions and try again."
                )
            elif e.status == 401:
                raise ValueError("GitHub token is invalid or expired.")
            elif e.status == 404:
                raise ValueError(f"Repository or branch not found: {repo_name}")
            elif e.status == 409:
                raise ValueError(
                    "Conflict: the file was modified after the review was generated. "
                    "Please re-run the review and try again."
                )
            raise ValueError(f"GitHub API error ({e.status}): {e.data.get('message', '')}")
        except Exception as e:
            if "already pushed" in str(e).lower() or "nothing to commit" in str(e).lower():
                raise ValueError("File is already up to date — no changes needed.")
            raise ValueError(f"Failed to push fix: {str(e)}")

    def list_user_repos(self, per_page: int = 100) -> List[Dict[str, Any]]:
        """
        List all repositories accessible to the authenticated user.
        Returns repos sorted by updated_at descending.
        Requires: Metadata read-only (minimum) OR repo scope for private repos.
        """
        if not self.token:
            raise ValueError("GitHub token required to list repositories.")

        logger.info("[Fetching User Repositories]")

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        try:
            result = []
            page = 1
            while True:
                resp = httpx.get(
                    f"{GITHUB_API_BASE}/user/repos",
                    headers=headers,
                    params={
                        "affiliation": "owner,collaborator,organization_member",
                        "sort": "updated",
                        "direction": "desc",
                        "per_page": min(per_page, 100),
                        "page": page,
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                batch = resp.json()
                if not batch:
                    break

                for repo in batch:
                    permissions = repo.get("permissions") or {}
                    result.append({
                        "name": repo.get("name", ""),
                        "full_name": repo.get("full_name", ""),
                        "visibility": repo.get("visibility") or ("private" if repo.get("private") else "public"),
                        "private": bool(repo.get("private")),
                        "description": repo.get("description") or "",
                        "language": repo.get("language") or "",
                        "stars": repo.get("stargazers_count", 0),
                        "updated_at": repo.get("updated_at") or "",
                        "url": repo.get("html_url") or "",
                        "fork": bool(repo.get("fork")),
                        "default_branch": repo.get("default_branch") or "",
                        "permissions": {
                            "admin": bool(permissions.get("admin")),
                            "maintain": bool(permissions.get("maintain")),
                            "push": bool(permissions.get("push")),
                            "triage": bool(permissions.get("triage")),
                            "pull": bool(permissions.get("pull")),
                        },
                    })

                if len(batch) < min(per_page, 100):
                    break
                page += 1

            logger.info(f"[Repositories Loaded] count={len(result)}")
            return result
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            detail = e.response.text[:300]
            logger.error(f"GitHub API error listing repos: {status} - {detail}")
            if status == 401:
                raise ValueError("GitHub token is invalid or expired.")
            if status == 403:
                raise ValueError("GitHub API rate limit exceeded or token lacks repository metadata access.")
            raise ValueError(f"GitHub API error ({status}): {detail}")
        except Exception as e:
            raise ValueError(f"Failed to list repositories: {str(e)}")

    def check_connection(self) -> bool:

        """Verify GitHub API connectivity."""
        try:
            if self.token:
                _ = self.client.get_user().login
            else:
                _ = self.client.get_rate_limit()
            return True
        except Exception as e:
            logger.warning(f"GitHub connection check failed: {e}")
            return False

    def create_webhook(self, repo_name: str, callback_url: str, secret: str) -> bool:
        """Create a webhook on the GitHub repository for pull request events."""
        try:
            repo = self.client.get_repo(repo_name)
            desired_events = {"pull_request", "issue_comment"}
            # Check if webhook already exists
            hooks = repo.get_hooks()
            for hook in hooks:
                if hook.config.get("url") == callback_url:
                    current_events = set(getattr(hook, "events", []) or [])
                    missing_events = desired_events - current_events
                    if missing_events:
                        hook.edit(
                            name="web",
                            config={
                                "url": callback_url,
                                "content_type": "json",
                                "secret": secret,
                            },
                            events=sorted(current_events | desired_events),
                            active=True,
                        )
                        logger.info(
                            f"Updated webhook events for {repo_name}: "
                            f"{sorted(current_events | desired_events)}"
                        )
                    logger.info(f"Webhook already exists for {repo_name} pointing to {callback_url}")
                    return True
            
            # Create webhook
            config = {
                "url": callback_url,
                "content_type": "json",
                "secret": secret
            }
            repo.create_hook("web", config, sorted(desired_events), active=True)
            logger.info(f"Successfully created pull_request webhook for {repo_name}")
            return True
        except GithubException as e:
            logger.error(f"Failed to create GitHub webhook for {repo_name}: {e.status} - {e.data}")
            # Webhook creation might fail due to lack of admin permissions on the repo
            return False
        except Exception as e:
            logger.error(f"Error creating GitHub webhook for {repo_name}: {str(e)}")
            return False

    def delete_webhook(self, repo_name: str, callback_url: str) -> bool:
        """Delete the webhook on the GitHub repository."""
        try:
            repo = self.client.get_repo(repo_name)
            hooks = repo.get_hooks()
            for hook in hooks:
                if hook.config.get("url") == callback_url:
                    hook.delete()
                    logger.info(f"Successfully deleted webhook for {repo_name} pointing to {callback_url}")
                    return True
            return False
        except Exception as e:
            logger.error(f"Error deleting GitHub webhook for {repo_name}: {str(e)}")
            return False

    # ─── Review Formatting Helpers ────────────────────────────────────────────

    def _format_inline_comment(self, issue: Dict[str, Any]) -> str:
        """Format a single issue as a GitHub inline review comment (Markdown)."""
        severity = issue.get("severity", "Low")
        emoji    = {"Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🟢"}.get(severity, "⚪")
        issue_type = issue.get("type", "")

        lines = [
            f"### {emoji} [{severity}] {issue.get('issue', 'Issue')}",
            f"**Category:** `{issue_type}`  ",
            "",
            f"**Problem:**  ",
            f"{issue.get('explanation', '')}",
            "",
        ]

        fix = issue.get("fix", "").strip()
        if fix:
            # Detect if fix contains code (has newlines or indentation)
            if "\n" in fix or fix.startswith((" ", "\t")):
                lang = self._guess_language(issue.get("file", ""))
                lines += [
                    "**Suggested Fix:**",
                    f"```{lang}",
                    fix,
                    "```",
                ]
            else:
                lines += [f"**Fix:** {fix}"]

        lines += [
            "",
            "---",
            "*🤖 AI PR Review Assistant — powered by NVIDIA NIM*",
        ]
        return "\n".join(lines)

    def _format_review_body(
        self,
        summary: str,
        issues:  List[Dict[str, Any]],
        pr_title: str = "",
    ) -> str:
        """Format the full review body as a rich Markdown document."""
        critical = [i for i in issues if i.get("severity") == "Critical"]
        high     = [i for i in issues if i.get("severity") == "High"]
        medium   = [i for i in issues if i.get("severity") == "Medium"]
        low      = [i for i in issues if i.get("severity") == "Low"]

        overall_risk = (
            "🔴 Critical" if critical else
            "🟠 High"     if high     else
            "🟡 Medium"   if medium   else
            "🟢 Low"
        )

        lines = [
            "## 🤖 AI Pull Request Review",
            "",
            "> **Powered by NVIDIA NIM · Llama 3.1 70B Instruct**",
            "> *This review was generated by an AI senior staff engineer simulation.*",
            "",
            "---",
            "",
            "### 📋 Executive Summary",
            "",
            summary,
            "",
            f"**Overall Risk:** {overall_risk}",
            "",
            "---",
            "",
            "### 📊 Issue Breakdown",
            "",
            "| Severity | Count | Requires Action |",
            "|----------|-------|----------------|",
            f"| 🔴 Critical | **{len(critical)}** | {'Yes — must fix before merge' if critical else 'None'} |",
            f"| 🟠 High     | **{len(high)}**     | {'Strongly recommended' if high else 'None'} |",
            f"| 🟡 Medium   | **{len(medium)}**   | {'Address in follow-up' if medium else 'None'} |",
            f"| 🟢 Low      | **{len(low)}**      | {'Improvement suggestions' if low else 'None'} |",
            f"| **Total**   | **{len(issues)}**   | — |",
            "",
        ]

        if issues:
            lines += [
                "---",
                "",
                "### 🔍 Issues Found",
                "",
            ]
            for i, issue in enumerate(issues, 1):
                sev   = issue.get("severity", "Low")
                emoji = {"Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🟢"}.get(sev, "⚪")
                file_ref = f"`{issue.get('file', '')}`" if issue.get("file") else ""
                line_ref = f" line {issue['line']}" if issue.get("line") else ""

                lines += [
                    f"<details>",
                    f"<summary>{emoji} <strong>[{sev}]</strong> {issue.get('issue', 'Issue')} "
                    f"— {file_ref}{line_ref}</summary>",
                    "",
                    f"**Type:** `{issue.get('type', 'Code Quality')}`",
                    "",
                    f"**Problem:**",
                    f"{issue.get('explanation', '')}",
                    "",
                ]

                fix = issue.get("fix", "").strip()
                if fix:
                    if "\n" in fix or fix.startswith((" ", "\t")):
                        lang = self._guess_language(issue.get("file", ""))
                        lines += ["**Suggested Fix:**", f"```{lang}", fix, "```", ""]
                    else:
                        lines += [f"**Fix:** {fix}", ""]

                lines += ["</details>", ""]

        lines += [
            "---",
            "",
            "*This automated review was generated by the [PR Review Assistant](https://github.com) "
            "using NVIDIA NIM AI. Review all suggestions before merging. "
            "Inline comments are posted at the relevant lines above.*",
        ]

        return "\n".join(lines)

    def _guess_language(self, filename: str) -> str:
        """Guess code fence language from file extension."""
        ext_map = {
            ".py":   "python", ".js":   "javascript", ".ts":    "typescript",
            ".jsx":  "jsx",    ".tsx":  "tsx",         ".go":    "go",
            ".java": "java",   ".kt":   "kotlin",      ".rs":    "rust",
            ".rb":   "ruby",   ".php":  "php",         ".cs":    "csharp",
            ".cpp":  "cpp",    ".c":    "c",            ".sh":    "bash",
            ".yaml": "yaml",   ".yml":  "yaml",        ".json":  "json",
            ".sql":  "sql",    ".tf":   "hcl",
        }
        for ext, lang in ext_map.items():
            if filename.endswith(ext):
                return lang
        return ""
