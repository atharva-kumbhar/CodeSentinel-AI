const explicitApiUrl = import.meta.env.VITE_API_URL?.trim()

function getDefaultApiUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8000'

  const { protocol, hostname, origin } = window.location
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (isLocalhost) return 'http://localhost:8000'
  if (protocol === 'http:' || protocol === 'https:') return origin

  return 'https://atharvark07-codesentinel-ai.hf.space'
}

export const API_BASE_URL = explicitApiUrl || getDefaultApiUrl()
