/**
 * Monitoring API
 * Handles repository listing and monitoring configuration.
 */
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const monitoringApi = {
  /**
   * Fetch all GitHub repositories accessible to the logged-in user.
   * @returns {{ repos: Array, count: number }}
   */
  fetchUserRepos: async () => {
    const { data } = await api.get('/api/monitoring/user-repos')
    return data  // { repos, count }
  },

  /**
   * Get the current monitoring configuration for the logged-in user.
   * @returns {{ config: { monitoring_enabled, monitor_all_repositories, selected_repositories, config_saved } }}
   */
  getMonitoringConfig: async () => {
    const { data } = await api.get('/api/monitoring/config')
    return data  // { config }
  },

  /**
   * Save the user's monitoring configuration.
   * @param {boolean} monitorAll - Monitor all repos
   * @param {string[]} selectedRepos - List of owner/repo strings (only used if monitorAll=false)
   * @param {boolean} monitoringEnabled
   * @returns {{ status, monitor_all, selected_count, message }}
   */
  saveMonitoringConfig: async (monitorAll, selectedRepos = [], monitoringEnabled = true) => {
    const { data } = await api.post('/api/monitoring/config', {
      monitor_all_repositories: monitorAll,
      selected_repositories:    selectedRepos,
      monitoring_enabled:       monitoringEnabled,
    })
    return data
  },

  /** Get current user's monitoring status summary (from /api/monitoring/settings) */
  getSettings: async () => {
    const { data } = await api.get('/api/monitoring/settings')
    return data
  },
}

export default monitoringApi
