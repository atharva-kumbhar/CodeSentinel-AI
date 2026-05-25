import axios from 'axios'
import { API_BASE_URL } from './config'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,   // 5 minutes — large PRs + AI generation can take time
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,   // Required — sends session cookie with every request
})

// Convert raw axios timeout error into a user-friendly message
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      err.message = 'The review is taking longer than expected. The AI may be busy — please try again in a moment.'
    }
    return Promise.reject(err)
  }
)

export const reviewApi = {
  /**
   * Web Dashboard mode: review by GitHub PR URL.
   * @param {string}      prUrl
   * @param {string|null} githubToken       — optional manual PAT
   * @param {boolean}     postGithubReview  — if true, backend posts inline comments to GitHub
   * @param {object|null} llmConfig         — runtime model config
   */
  reviewByUrl: async (prUrl, githubToken = null, postGithubReview = false, llmConfig = null) => {
    const payload = {
      pr_url:              prUrl,
      post_github_review:  postGithubReview,
    }
    if (githubToken?.trim()) payload.github_token = githubToken.trim()
    if (llmConfig) payload.llm_config = llmConfig
    const { data } = await api.post('/api/review/url', payload)
    return data
  },

  /** CI/CD mode: review by raw diff */
  reviewByDiff: async ({ diffContent, repoName, prNumber, prTitle, baseBranch, llmConfig }) => {
    const { data } = await api.post('/api/review/diff', {
      diff_content: diffContent,
      repo_name:    repoName,
      pr_number:    prNumber,
      pr_title:     prTitle   || '',
      base_branch:  baseBranch || 'main',
      llm_config:   llmConfig || null
    })
    return data
  },

  /** Generate AI Fix for a specific issue */
  generateFix: async (issue, fileContent = null, diffContext = null, llmConfig = null) => {
    const { data } = await api.post('/api/review/fix', {
      issue,
      file_content: fileContent,
      diff_context: diffContext,
      llm_config: llmConfig
    })
    return data
  },

  /** Get current authenticated user from session (no token exposed) */
  getAuthMe: async () => {
    const { data } = await api.get('/api/auth/me')
    return data
  },

  /** Log out — clears the session cookie on the server */
  logout: async () => {
    const { data } = await api.post('/api/auth/logout')
    return data
  },

  /** Health check */
  healthCheck: async () => {
    const { data } = await api.get('/api/health')
    return data
  },

  /** Get available providers */
  getProviders: async () => {
    const { data } = await api.get('/api/review/providers')
    return data
  },

  /**
   * Test connectivity to an LLM provider using a supplied API key.
   * @param {string} provider_id
   * @param {string} api_key
   * @param {string?} base_url
   * @param {string?} model
   */
  testConnection: async (provider_id, api_key, base_url = null, model = null) => {
    const { data } = await api.post('/api/review/test-connection', {
      provider_id,
      api_key,
      base_url,
      model,
    })
    return data  // { success: bool, message: str }
  },

  /**
   * Post an AI-generated fix as a native GitHub Suggestion comment on a PR.
   * GitHub shows this as an inline "Apply suggestion" button the PR author can click.
   *
   * @param {string} prUrl         - GitHub PR URL (https://github.com/owner/repo/pull/123)
   * @param {string} filePath      - File path relative to repo root (e.g. src/app.py)
   * @param {number} line          - Line number to attach the suggestion to
   * @param {string} fixedCode     - The corrected code (shown inside ```suggestion block)
   * @param {string} issueTitle    - Issue title for the comment header
   * @param {string} explanation   - Brief problem explanation
   * @param {string} severity      - Severity level (Critical/High/Medium/Low)
   * @returns {{ success, comment_url, comment_id, message }}
   */
  postSuggestion: async ({ prUrl, filePath, line, fixedCode, issueTitle = '', explanation = '', severity = '' }) => {
    const { data } = await api.post('/api/review/suggest', {
      pr_url:            prUrl,
      file_path:         filePath,
      line:              line,
      fixed_code:        fixedCode,
      issue_title:       issueTitle,
      issue_explanation: explanation,
      severity:          severity,
    })
    return data  // { success, comment_url, comment_id, message }
  },

  /**
   * Push AI-generated fixed code directly as a commit to the PR branch.
   * Replaces the original file on GitHub — creates a real commit on the PR head branch.
   *
   * @param {string} prUrl         - GitHub PR URL
   * @param {string} filePath      - File path relative to repo root
   * @param {string} fixedCode     - Complete corrected file content to commit
   * @param {string} issueTitle    - Used in auto-generated commit message
   * @param {string} commitMessage - Optional custom commit message
   * @returns {{ success, commit_url, commit_sha, branch, message }}
   */
  pushFix: async ({ prUrl, filePath, fixedCode, issueTitle = '', commitMessage = '' }) => {
    const { data } = await api.post('/api/review/push-fix', {
      pr_url:         prUrl,
      file_path:      filePath,
      fixed_code:     fixedCode,
      issue_title:    issueTitle,
      commit_message: commitMessage,
    })
    return data  // { success, commit_url, commit_sha, branch, message }
  },
}

export default api
