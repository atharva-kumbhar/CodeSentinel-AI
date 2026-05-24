/**
 * useReviewFeed Hook
 * ──────────────────
 * Real-time review activity feed from backend API.
 * Streams live review updates by polling the FastAPI backend reviews list.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API, withCredentials: true })

export function useReviewFeed(maxItems = 20) {
  const { user } = useAuth()
  const authenticated = !!user

  const [reviews, setReviews] = useState([])
  const [feedLoading, setFeedLoading] = useState(true)

  const fetchReviews = useCallback(async () => {
    if (!authenticated) return
    try {
      const res = await api.get(`/api/monitoring/reviews?limit=${maxItems}`)
      setReviews(res.data.reviews || [])
      setFeedLoading(false)
    } catch (err) {
      console.error("Failed to fetch review history:", err)
      setFeedLoading(false)
    }
  }, [authenticated, maxItems])

  useEffect(() => {
    if (!authenticated) {
      setReviews([])
      setFeedLoading(false)
      return
    }

    setFeedLoading(true)
    fetchReviews()

    // Real-time updates simulation using highly efficient short-polling
    const interval = setInterval(fetchReviews, 4000)
    return () => clearInterval(interval)
  }, [authenticated, fetchReviews])

  const pendingCount  = reviews.filter(r => r.status === 'pending').length
  const runningCount  = reviews.filter(r => r.status === 'running').length
  const completeCount = reviews.filter(r => r.status === 'complete').length
  const errorCount    = reviews.filter(r => r.status === 'error').length

  return {
    reviews,
    feedLoading,
    pendingCount,
    runningCount,
    completeCount,
    errorCount,
    hasActivity: reviews.length > 0,
    refreshReviews: fetchReviews
  }
}
export default useReviewFeed
