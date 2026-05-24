/**
 * useMonitoring Hook
 * ──────────────────
 * Handles continuous PR monitoring state.
 * Consumes FastAPI backend endpoints directly and polls periodically
 * for live, real-time repository and webhook activity updates.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API, withCredentials: true })

export function useMonitoring() {
  const { user } = useAuth()
  const authenticated = !!user

  const [repos,          setRepos]          = useState([])
  const [settings,       setSettings]       = useState({})
  const [config,         setConfig]         = useState(null)
  const [monitoringLoading, setLoading]     = useState(false)
  const [monitoringError,   setError]       = useState(null)

  // Fetch repositories from backend
  const fetchRepos = useCallback(async () => {
    if (!authenticated) return
    try {
      const res = await api.get('/api/monitoring/repos')
      setRepos(res.data.repos || [])
    } catch (err) {
      console.error("Failed to fetch monitored repos:", err)
    }
  }, [authenticated])

  const fetchConfig = useCallback(async () => {
    if (!authenticated) return
    try {
      const res = await api.get('/api/monitoring/config')
      const nextConfig = res.data.config || {}
      setConfig(nextConfig)
      setSettings(prev => ({
        ...prev,
        monitoring_enabled: nextConfig.monitoring_enabled ?? prev.monitoring_enabled,
      }))
    } catch (err) {
      console.error("Failed to fetch monitoring config:", err)
    }
  }, [authenticated])

  // Poll repos list for live status updates (e.g. webhook activity or review completion)
  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => {
        setRepos([])
        setConfig(null)
        setSettings({})
      })
      return
    }
    
    // Initial fetch
    queueMicrotask(() => {
      fetchRepos()
      fetchConfig()
    })
    
    // Polling interval for real-time status update feeling
    const interval = setInterval(fetchRepos, 4000)
    return () => clearInterval(interval)
  }, [authenticated, fetchRepos, fetchConfig])

  // Load persisted settings
  useEffect(() => {
    if (!authenticated) return
    api.get('/api/monitoring/settings')
      .then(r => setSettings(r.data.settings || {}))
      .catch(() => {})
  }, [authenticated])

  const addRepo = useCallback(async (repoFullName, options = {}) => {
    setLoading(true)
    setError(null)
    try {
      await api.post('/api/monitoring/repos', {
        repo_full_name: repoFullName,
        auto_review:    options.autoReview ?? true,
        auto_post:      options.autoPost   ?? true,
        ai_model:       options.aiModel    ?? '',
      })
      // Instant refresh for interactive feedback
      await fetchRepos()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add repository.')
    } finally {
      setLoading(false)
    }
  }, [fetchRepos])

  const removeRepo = useCallback(async (repoFullName) => {
    const [owner, repo] = repoFullName.split('/')
    try {
      await api.delete(`/api/monitoring/repos/${owner}/${repo}`)
      await fetchRepos()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to remove repository.')
    }
  }, [fetchRepos])

  const toggleRepo = useCallback(async (repoFullName, enabled) => {
    try {
      await api.patch('/api/monitoring/repos/toggle', { repo_full_name: repoFullName, enabled })
      await fetchRepos()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to toggle monitoring.')
    }
  }, [fetchRepos])

  const saveSettings = useCallback(async (newSettings) => {
    try {
      if (Object.prototype.hasOwnProperty.call(newSettings, 'monitoring_enabled')) {
        const currentConfig = config || {}
        await api.post('/api/monitoring/config', {
          monitor_all_repositories: currentConfig.monitor_all_repositories ?? true,
          selected_repositories: currentConfig.selected_repositories || [],
          monitoring_enabled: newSettings.monitoring_enabled,
        })
        await fetchConfig()
        await fetchRepos()
      } else {
        await api.put('/api/monitoring/settings', newSettings)
        setSettings(prev => ({ ...prev, ...newSettings }))
      }
    } catch {
      setError('Failed to save settings.')
    }
  }, [config, fetchConfig, fetchRepos])

  return {
    repos,
    settings,
    config,
    monitoringLoading,
    monitoringError,
    addRepo,
    removeRepo,
    toggleRepo,
    saveSettings,
    isMonitoringEnabled: settings.monitoring_enabled ?? false,
    refreshRepos: fetchRepos,
    refreshConfig: fetchConfig,
  }
}
export default useMonitoring
