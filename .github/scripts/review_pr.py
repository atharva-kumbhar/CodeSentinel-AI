#!/usr/bin/env python3
"""
GitHub Action AI Review Script
─────────────────────────────
Fetches the PR diff, sends it to the backend AI review engine,
then posts a STRUCTURED GitHub PR Review with:
  - A rich Markdown review summary as the review body
  - Inline review comments on each flagged line (using GitHub Review API)
  - REQUEST_CHANGES event for Critical issues, COMMENT otherwise

Environment variables (set as GitHub Action secrets/env):
  GITHUB_TOKEN      - Auto-provided by GitHub Actions
  REVIEW_API_URL    - Your deployed backend URL (e.g., https://your-app.onrender.com)
  PR_NUMBER         - Pull request number
  REPO_NAME         - owner/repo
  PR_TITLE          - Pull request title
  BASE_BRANCH       - Base branch (e.g., main)
  HEAD_SHA          - HEAD commit SHA
"""

import os
import sys
import json
import time
import requests

# ─── Config ────────────────────────────────────────────────────────────────────
GITHUB_TOKEN   = os.environ.get("GITHUB_TOKEN",   "")
REVIEW_API_URL = os.environ.get("REVIEW_API_URL", "").rstrip("/")
PR_NUMBER      = int(os.environ.get("PR_NUMBER",  "0"))
REPO_NAME      = os.environ.get("REPO_NAME",      "")
PR_TITLE       = os.environ.get("PR_TITLE",       f"PR #{PR_NUMBER}")
BASE_BRANCH    = os.environ.get("BASE_BRANCH",    "main")
HEAD_SHA       = os.environ.get("HEAD_SHA",       "")

GITHUB_API     = "https://api.github.com"
DIFF_HEADERS   = {
    "Authorization":        f"Bearer {GITHUB_TOKEN}",
    "Accept":               "application/vnd.github.v3.diff",
    "X-GitHub-Api-Version": "2022-11-28",
}
JSON_HEADERS   = {
    "Authorization":        f"Bearer {GITHUB_TOKEN}",
    "Accept":               "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type":         "application/json",
}


# ─── Step 1: Fetch PR diff ─────────────────────────────────────────────────────

def fetch_pr_diff() -> str:
    url = f"{GITHUB_API}/repos/{REPO_NAME}/pulls/{PR_NUMBER}"
    print(f"[AI Review] Fetching PR diff from: {url}")
    resp = requests.get(url, headers=DIFF_HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"[AI Review] ERROR: GitHub returned {resp.status_code}: {resp.text[:400]}")
        sys.exit(1)
    print(f"[AI Review] Fetched {len(resp.text):,} chars of diff.")
    return resp.text


# ─── Step 2: Send to AI review backend ────────────────────────────────────────

def run_ai_review(diff_content: str) -> dict:
    if not REVIEW_API_URL:
        print("[AI Review] ERROR: REVIEW_API_URL secret not set.")
        sys.exit(1)

    endpoint = f"{REVIEW_API_URL}/api/review/diff"
    payload  = {
        "diff_content": diff_content,
        "repo_name":    REPO_NAME,
        "pr_number":    PR_NUMBER,
        "pr_title":     PR_TITLE,
        "base_branch":  BASE_BRANCH,
    }

    print(f"[AI Review] Sending to backend: {endpoint}")
    start = time.time()
    resp  = requests.post(
        endpoint,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=180,
    )
    elapsed = time.time() - start

    if resp.status_code != 200:
        print(f"[AI Review] ERROR: Review API returned {resp.status_code}: {resp.text[:500]}")
        sys.exit(1)

    review = resp.json()
    print(f"[AI Review] Review complete in {elapsed:.1f}s — {review.get('total_issues', 0)} issues found.")
    return review


# ─── Step 3: Post GitHub PR Review with inline comments ───────────────────────

def severity_emoji(sev: str) -> str:
    return {"Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🟢"}.get(sev, "⚪")


def guess_language(filename: str) -> str:
    ext_map = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".go": "go",     ".java": "java",      ".rb": "ruby",
        ".rs": "rust",   ".php": "php",        ".cs": "csharp",
        ".cpp": "cpp",   ".sh": "bash",        ".sql": "sql",
        ".yml": "yaml",  ".yaml": "yaml",      ".json": "json",
    }
    for ext, lang in ext_map.items():
        if filename.endswith(ext):
            return lang
    return ""


def build_inline_comment(issue: dict) -> str:
    """Build a GitHub inline review comment body for a single issue."""
    sev   = issue.get("severity", "Low")
    emoji = severity_emoji(sev)
    lines = [
        f"### {emoji} [{sev}] {issue.get('issue', 'Issue')}",
        f"**Category:** `{issue.get('type', 'Code Quality')}`",
        "",
        "**Problem:**",
        issue.get("explanation", ""),
        "",
    ]
    fix = (issue.get("fix") or "").strip()
    if fix:
        if "\n" in fix or fix.startswith((" ", "\t")):
            lang = guess_language(issue.get("file", ""))
            lines += ["**Suggested Fix:**", f"```{lang}", fix, "```"]
        else:
            lines.append(f"**Fix:** {fix}")
    lines += ["", "---", "*🤖 AI PR Review — powered by NVIDIA NIM*"]
    return "\n".join(lines)


def build_review_body(review: dict) -> str:
    """Build the top-level review summary body."""
    issues   = review.get("issues", [])
    summary  = review.get("summary", "")
    critical = sum(1 for i in issues if i.get("severity") == "Critical")
    high     = sum(1 for i in issues if i.get("severity") == "High")
    medium   = sum(1 for i in issues if i.get("severity") == "Medium")
    low      = sum(1 for i in issues if i.get("severity") == "Low")
    total    = len(issues)
    confidence = int(review.get("confidence_score", 0.85) * 100)
    elapsed    = round(review.get("review_time_ms", 0) / 1000, 1)

    overall = (
        "🔴 Critical — Must fix before merge" if critical else
        "🟠 High — Significant concerns"      if high     else
        "🟡 Medium — Improvements needed"     if medium   else
        "🟢 Low — Minor improvements"
    )

    lines = [
        "## 🤖 AI Pull Request Review",
        "",
        "> **Powered by NVIDIA NIM · Llama 3.1 70B Instruct**",
        "> *Reviewed as a senior staff engineer — security, performance, reliability, and architecture.*",
        "",
        "---",
        "",
        "### 📋 Executive Summary",
        "",
        summary,
        "",
        f"**Overall Risk:** {overall}",
        "",
        "---",
        "",
        "### 📊 Issue Breakdown",
        "",
        "| Severity | Count | Action Required |",
        "|----------|-------|----------------|",
        f"| 🔴 Critical | **{critical}** | {'⛔ Block merge — fix immediately' if critical else '✅ None'} |",
        f"| 🟠 High     | **{high}**     | {'⚠️ Strongly recommended' if high else '✅ None'} |",
        f"| 🟡 Medium   | **{medium}**   | {'💡 Address in follow-up' if medium else '✅ None'} |",
        f"| 🟢 Low      | **{low}**      | {'📝 Suggestions' if low else '✅ None'} |",
        f"| **Total**   | **{total}**    | Confidence: {confidence}% · Time: {elapsed}s |",
        "",
        "---",
        "",
        "> 📌 **Inline comments** have been posted at each flagged line above.",
        "> Review them in the **Files changed** tab.",
        "",
        "---",
        "",
        "*This automated review was generated by [PR Review Assistant](https://github.com).*",
        "*Verify all suggestions before merging.*",
    ]
    return "\n".join(lines)


def post_github_review(review: dict) -> bool:
    """Post the full GitHub PR Review using the Reviews API."""
    issues = review.get("issues", [])

    # Build inline comments for issues with file + line
    inline_comments = []
    for issue in issues:
        file_path = issue.get("file", "")
        line      = issue.get("line", 0)
        if file_path and file_path not in ("unknown", "") and isinstance(line, int) and line > 0:
            inline_comments.append({
                "path": file_path,
                "line": line,
                "side": "RIGHT",
                "body": build_inline_comment(issue),
            })

    has_critical = any(i.get("severity") == "Critical" for i in issues)
    event        = "REQUEST_CHANGES" if has_critical else "COMMENT"
    review_body  = build_review_body(review)

    payload = {
        "body":     review_body,
        "event":    event,
        "comments": inline_comments,
    }

    url  = f"{GITHUB_API}/repos/{REPO_NAME}/pulls/{PR_NUMBER}/reviews"
    print(f"[AI Review] Posting GitHub review ({event}) with {len(inline_comments)} inline comment(s)...")

    resp = requests.post(url, headers=JSON_HEADERS, json=payload, timeout=30)

    if resp.status_code == 422 and inline_comments:
        # Some inline positions may be invalid — retry without inline comments
        print("[AI Review] Inline comment positions failed (422). Retrying as body-only review...")
        payload["comments"] = []
        resp = requests.post(url, headers=JSON_HEADERS, json=payload, timeout=30)

    if resp.status_code in (200, 201):
        result = resp.json()
        review_url = result.get("html_url", "")
        print(f"[AI Review] ✅ Review posted successfully: {review_url}")
        return True
    else:
        print(f"[AI Review] ❌ Failed to post review: {resp.status_code}: {resp.text[:400]}")
        return False


# ─── Step 4: Print summary to action logs ──────────────────────────────────────

def print_action_summary(review: dict) -> None:
    """Print a structured summary to the GitHub Actions log."""
    issues    = review.get("issues", [])
    critical  = [i for i in issues if i.get("severity") == "Critical"]
    high      = [i for i in issues if i.get("severity") == "High"]

    print("\n" + "═" * 60)
    print("  AI REVIEW RESULTS")
    print("═" * 60)
    print(f"  Total Issues   : {len(issues)}")
    print(f"  Critical       : {len(critical)}")
    print(f"  High           : {len(high)}")
    print(f"  Confidence     : {int(review.get('confidence_score', 0) * 100)}%")
    print(f"  Review Time    : {review.get('review_time_ms', 0) / 1000:.1f}s")
    print("═" * 60)

    if critical:
        print("\n🔴 CRITICAL ISSUES (must fix before merge):")
        for issue in critical:
            print(f"   [{issue.get('file', '?')}:{issue.get('line', '?')}] {issue.get('issue', '')}")

    if high:
        print("\n🟠 HIGH SEVERITY ISSUES:")
        for issue in high:
            print(f"   [{issue.get('file', '?')}:{issue.get('line', '?')}] {issue.get('issue', '')}")

    print()

    # Exit with code 1 if there are critical issues (fails the CI check)
    if critical:
        print("[AI Review] ⛔ Blocking PR — critical issues must be resolved before merge.")
        sys.exit(1)


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"[AI Review] Starting review for {REPO_NAME} PR #{PR_NUMBER} — '{PR_TITLE}'")

    diff_content = fetch_pr_diff()
    if not diff_content.strip():
        print("[AI Review] No diff content found. Skipping review.")
        return

    review = run_ai_review(diff_content)
    posted = post_github_review(review)

    if not posted:
        print("[AI Review] ⚠️  Could not post GitHub review — check GITHUB_TOKEN permissions.")

    print_action_summary(review)


if __name__ == "__main__":
    main()
