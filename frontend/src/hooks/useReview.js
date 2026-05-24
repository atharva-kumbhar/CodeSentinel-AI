import { useState, useCallback } from 'react'
import { reviewApi } from '../api/reviewApi'

/**
 * Safely extract a human-readable error message from an axios error.
 * Handles FastAPI's Pydantic validation error format (array of {loc, msg, type} objects)
 * as well as plain string detail messages.
 */
function parseApiError(err) {
  const detail = err?.response?.data?.detail

  // FastAPI Pydantic validation error — array of error objects
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter(Boolean).join(' → ') : ''
        const msg   = typeof d.msg === 'string' ? d.msg : JSON.stringify(d.msg)
        return field ? `${field}: ${msg}` : msg
      })
      .join('  •  ')
  }

  // Plain string detail
  if (typeof detail === 'string') return detail

  // Axios network / server error
  if (err?.message) return err.message

  return 'An unexpected error occurred. Please try again.'
}

/**
 * Review stage pipeline — drives both the status text and LoadingState steps.
 * Times are conservative; real completion will happen sooner in most cases.
 */
const STAGES = [
  { ms: 0,     text: 'Fetching Pull Request from GitHub…'              },
  { ms: 1200,  text: 'Processing diff and filtering noise…'            },
  { ms: 2500,  text: 'Running security scan…'                          },
  { ms: 5000,  text: 'Running performance analysis…'                   },
  { ms: 8000,  text: 'Generating AI review…'                           },
  { ms: 35000, text: 'Posting inline review comments to GitHub…'       },
]

/**
 * Custom hook encapsulating all PR review state and logic.
 *
 * githubToken    — in-memory only, never persisted to localStorage/server
 * postToGitHub   — if true, the backend will post the review as inline GitHub comments
 */
export function useReview() {
  const [review,  setReview]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)   // always a string
  const [status,  setStatus]  = useState('')
  const [activeTab, setActiveTab] = useState('issues')

  // In-memory session — clears on page refresh, never written to localStorage/server
  const [githubToken,  setGithubToken]  = useState('')
  const [postToGitHub, setPostToGitHub] = useState(false)
  const [llmConfig, setLlmConfig] = useState(null)

  const runReview = useCallback(async (prUrl) => {
    if (!prUrl?.trim()) {
      setError('Please enter a valid GitHub Pull Request URL.')
      return
    }

    setLoading(true)
    setError(null)
    setReview(null)

    // Kick off the stage pipeline — timers are cleared on completion/error
    const timers = []
    STAGES.forEach(({ ms, text }, idx) => {
      // Skip the "Posting to GitHub" stage if the user didn't enable it
      if (idx === 5 && !postToGitHub) return
      timers.push(setTimeout(() => setStatus(text), ms))
    })

    try {
      const result = await reviewApi.reviewByUrl(
        prUrl,
        githubToken || null,
        postToGitHub,
        llmConfig
      )
      setReview(result)
      setStatus('')
      setActiveTab('issues')
    } catch (err) {
      setError(parseApiError(err))
      setStatus('')
    } finally {
      timers.forEach(clearTimeout)
      setLoading(false)
    }
  }, [githubToken, postToGitHub, llmConfig])

  const clearReview = useCallback(() => {
    setReview(null)
    setError(null)
    setStatus('')
  }, [])

  return {
    review, loading, error, status,
    activeTab, setActiveTab,
    githubToken,  setGithubToken,
    postToGitHub, setPostToGitHub,
    llmConfig, setLlmConfig,
    runReview, clearReview,
  }
}
