"""
Diff Processor Service
Parses, cleans, and optimizes raw git diffs for AI analysis.
Removes unnecessary metadata, ignores lock/binary files, preserves
filenames/line numbers, and chunks large diffs intelligently.
"""

import re
import logging
from typing import List, Dict, Any, Tuple
from config import settings

logger = logging.getLogger(__name__)

# Files to ignore completely — lock files, generated artifacts, binaries
IGNORED_FILE_PATTERNS = [
    r"package-lock\.json$",
    r"yarn\.lock$",
    r"pnpm-lock\.yaml$",
    r"poetry\.lock$",
    r"Cargo\.lock$",
    r"Gemfile\.lock$",
    r"composer\.lock$",
    r"\.lock$",
    r"\.min\.js$",
    r"\.min\.css$",
    r"dist/.*",
    r"build/.*",
    r"\.next/.*",
    r"__pycache__/.*",
    r"\.pyc$",
    r"node_modules/.*",
    r"vendor/.*",
    r"\.pb\.go$",
    r"_generated\.go$",
    r"\.generated\.",
    r"migrations/.*\.sql$",
    r"\.svg$",
    r"\.png$",
    r"\.jpg$",
    r"\.jpeg$",
    r"\.gif$",
    r"\.ico$",
    r"\.woff$",
    r"\.woff2$",
    r"\.ttf$",
    r"\.eot$",
    r"\.pdf$",
    r"\.zip$",
    r"\.tar\.gz$",
]

# Git diff metadata lines to strip
METADATA_PATTERNS = [
    r"^index [0-9a-f]+\.\.[0-9a-f]+ [0-9]+$",
    r"^similarity index \d+%$",
    r"^rename from .+$",
    r"^rename to .+$",
    r"^old mode \d+$",
    r"^new mode \d+$",
    r"^Binary files .+ differ$",
    r"^diff --git .+$",
]


class DiffProcessor:
    """Service for parsing and optimizing raw git diffs for AI consumption."""

    def __init__(self):
        self.ignored_patterns = [re.compile(p) for p in IGNORED_FILE_PATTERNS]
        self.metadata_patterns = [re.compile(p) for p in METADATA_PATTERNS]
        self.max_chunk_size = settings.MAX_CHUNK_SIZE
        self.max_diff_tokens = settings.MAX_DIFF_TOKENS

    def _should_ignore_file(self, filename: str) -> bool:
        """Check if a file should be ignored based on name patterns."""
        for pattern in self.ignored_patterns:
            if pattern.search(filename):
                return True
        return False

    def _is_metadata_line(self, line: str) -> bool:
        """Check if a diff line is pure metadata to be stripped."""
        for pattern in self.metadata_patterns:
            if pattern.match(line):
                return True
        return False

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate: ~4 chars per token."""
        return len(text) // 4

    def process_diff(self, raw_diff: str) -> Dict[str, Any]:
        """
        Main entry point. Processes a raw git diff string and returns
        a structured, cleaned representation with per-file diffs.
        """
        if not raw_diff or not raw_diff.strip():
            return {
                "processed_diff": "",
                "files": [],
                "file_diffs": {},
                "chunks": [],
                "skipped_files": [],
                "total_additions": 0,
                "total_deletions": 0,
            }

        file_sections = self._split_into_file_sections(raw_diff)
        processed_files = []
        file_diffs: Dict[str, str] = {}
        skipped_files: List[str] = []
        total_additions = 0
        total_deletions = 0

        for filename, diff_body in file_sections:
            if self._should_ignore_file(filename):
                skipped_files.append(filename)
                logger.debug(f"Skipping ignored file: {filename}")
                continue

            cleaned_body, additions, deletions = self._clean_diff_body(diff_body)

            if not cleaned_body.strip():
                continue

            processed_files.append(filename)
            file_diffs[filename] = cleaned_body
            total_additions += additions
            total_deletions += deletions

        # Build the full processed diff string
        processed_parts = []
        for fname in processed_files:
            processed_parts.append(f"--- a/{fname}\n+++ b/{fname}\n{file_diffs[fname]}")

        full_processed = "\n\n".join(processed_parts)

        # Chunk if too large
        chunks = self._chunk_diff(full_processed, processed_files, file_diffs)

        return {
            "processed_diff": full_processed,
            "files": processed_files,
            "file_diffs": file_diffs,
            "chunks": chunks,
            "skipped_files": skipped_files,
            "total_additions": total_additions,
            "total_deletions": total_deletions,
        }

    def _split_into_file_sections(self, raw_diff: str) -> List[Tuple[str, str]]:
        """
        Split a raw diff string into per-file sections.
        Returns list of (filename, diff_body) tuples.
        """
        sections: List[Tuple[str, str]] = []

        # Split on '--- a/' or '+++ b/' markers
        file_pattern = re.compile(
            r"^(?:---\s+a/(.+)|diff\s+--git\s+a/\S+\s+b/(\S+))",
            re.MULTILINE,
        )

        # Try splitting by 'diff --git' headers first
        git_header = re.compile(r"^diff --git a/(.+?) b/\1$", re.MULTILINE)
        parts = git_header.split(raw_diff)

        if len(parts) > 1:
            # parts: [prefix, filename, body, filename, body, ...]
            i = 1
            while i < len(parts) - 1:
                filename = parts[i].strip()
                body = parts[i + 1] if i + 1 < len(parts) else ""
                if filename:
                    sections.append((filename, body))
                i += 2
        else:
            # Fall back: split on '--- a/' markers
            file_section_pattern = re.compile(r"^---\s+a/(.+)$", re.MULTILINE)
            matches = list(file_section_pattern.finditer(raw_diff))
            for idx, match in enumerate(matches):
                filename = match.group(1).strip()
                start = match.start()
                end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw_diff)
                body = raw_diff[start:end]
                sections.append((filename, body))

        # Last resort: use '+++ b/' markers if nothing else found
        if not sections:
            plus_pattern = re.compile(r"^\+\+\+\s+b/(.+)$", re.MULTILINE)
            matches = list(plus_pattern.finditer(raw_diff))
            for idx, match in enumerate(matches):
                filename = match.group(1).strip()
                start = match.start()
                end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw_diff)
                body = raw_diff[start:end]
                sections.append((filename, body))

        return sections

    def _clean_diff_body(self, diff_body: str) -> Tuple[str, int, int]:
        """
        Clean a single file's diff body:
        - Remove pure git metadata lines (index, mode, similarity)
        - Preserve hunk headers (@@ ... @@) with line numbers
        - Keep added (+), removed (-), AND context lines
          Context lines are critical — the AI needs surrounding code to detect
          issues like missing error handling, resource leaks, unsafe patterns.
        Returns (cleaned_body, additions_count, deletions_count)
        """
        lines = diff_body.splitlines()
        cleaned_lines = []
        additions = 0
        deletions = 0

        for line in lines:
            # Strip git metadata (index hash, mode changes, binary markers)
            if self._is_metadata_line(line):
                continue

            # Always keep hunk headers — they give line numbers
            if line.startswith("@@"):
                cleaned_lines.append(line)
                continue

            # Keep file markers
            if line.startswith("---") or line.startswith("+++"):
                cleaned_lines.append(line)
                continue

            # Added lines
            if line.startswith("+"):
                cleaned_lines.append(line)
                additions += 1
                continue

            # Removed lines
            if line.startswith("-"):
                cleaned_lines.append(line)
                deletions += 1
                continue

            # Context lines (unchanged) — KEEP them so the AI sees full code context.
            # Without context, the AI cannot detect: resource leaks, missing error handling,
            # security issues in surrounding code, or architectural problems.
            cleaned_lines.append(line)

        return "\n".join(cleaned_lines), additions, deletions

    def _chunk_diff(
        self,
        full_diff: str,
        files: List[str],
        file_diffs: Dict[str, str],
    ) -> List[str]:
        """
        If the diff is too large, split it into smaller chunks by file groups.
        Each chunk stays under MAX_CHUNK_SIZE token estimate.
        """
        total_tokens = self._estimate_tokens(full_diff)

        if total_tokens <= self.max_diff_tokens:
            return [full_diff] if full_diff.strip() else []

        logger.info(
            f"Diff too large ({total_tokens} est. tokens). "
            f"Chunking into parts ≤ {self.max_chunk_size} tokens."
        )

        chunks = []
        current_chunk_parts = []
        current_chunk_tokens = 0

        for filename in files:
            file_diff_text = f"--- a/{filename}\n+++ b/{filename}\n{file_diffs[filename]}"
            file_tokens = self._estimate_tokens(file_diff_text)

            if current_chunk_tokens + file_tokens > self.max_chunk_size and current_chunk_parts:
                chunks.append("\n\n".join(current_chunk_parts))
                current_chunk_parts = []
                current_chunk_tokens = 0

            current_chunk_parts.append(file_diff_text)
            current_chunk_tokens += file_tokens

        if current_chunk_parts:
            chunks.append("\n\n".join(current_chunk_parts))

        logger.info(f"Split diff into {len(chunks)} chunk(s).")
        return chunks

    def get_diff_summary(self, processed: Dict[str, Any]) -> str:
        """Return a brief human-readable summary of what was processed."""
        files = processed.get("files", [])
        skipped = processed.get("skipped_files", [])
        adds = processed.get("total_additions", 0)
        dels = processed.get("total_deletions", 0)
        chunks = processed.get("chunks", [])

        return (
            f"Analyzed {len(files)} file(s), skipped {len(skipped)} file(s). "
            f"+{adds} additions / -{dels} deletions. "
            f"Split into {len(chunks)} chunk(s) for AI processing."
        )
