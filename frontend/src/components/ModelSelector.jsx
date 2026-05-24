import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Cpu, X, KeyRound, CheckCircle2, ChevronDown,
  Activity, Settings2, Wifi, WifiOff, Loader2,
} from 'lucide-react'
import { reviewApi } from '../api/reviewApi'

// ─── Provider categories ───────────────────────────────────────────────────────
const PROVIDER_GROUPS = {
  'NVIDIA NIM': ['nvidia-nemotron', 'nvidia-llama'],
  'OpenAI':     ['gpt-4', 'gpt-4o'],
  'Anthropic':  ['claude'],
  'Groq':       ['llama3', 'mixtral'],
  'Other':      ['deepseek', 'qwen-coder'],
}

function groupProviders(providers) {
  const grouped = []
  const placed  = new Set()

  for (const [groupName, ids] of Object.entries(PROVIDER_GROUPS)) {
    const members = ids.map(id => providers.find(p => p.id === id)).filter(Boolean)
    if (members.length) {
      grouped.push({ group: groupName, providers: members })
      members.forEach(p => placed.add(p.id))
    }
  }

  // Anything not categorised goes to "Other"
  const remaining = providers.filter(p => !placed.has(p.id))
  if (remaining.length) grouped.push({ group: 'Other', providers: remaining })

  return grouped
}

// ─── Connection test states ────────────────────────────────────────────────────
// 'idle' | 'testing' | 'ok' | 'fail'

export default function ModelSelector({ llmConfig, setLlmConfig }) {
  const [isOpen, setIsOpen] = useState(false)
  const [providers, setProviders] = useState([])
  const [grouped, setGrouped]     = useState([])

  // Local modal form state
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [apiKey, setApiKey]                         = useState('')
  const [connStatus, setConnStatus]                 = useState('idle')   // 'idle'|'testing'|'ok'|'fail'
  const [connMessage, setConnMessage]               = useState('')

  useEffect(() => {
    async function fetchProviders() {
      try {
        const data = await reviewApi.getProviders()
        if (data.providers) {
          setProviders(data.providers)
          setGrouped(groupProviders(data.providers))
        }
      } catch (e) {
        console.error('Failed to fetch LLM providers', e)
      }
    }
    fetchProviders()
  }, [])

  const handleOpen = () => {
    if (llmConfig) {
      setSelectedProviderId(llmConfig.provider_id)
      setApiKey(llmConfig.api_key)
    } else if (providers.length > 0) {
      setSelectedProviderId(providers[0].id)
    }
    setConnStatus('idle')
    setConnMessage('')
    setIsOpen(true)
  }

  const handleTestConnection = async () => {
    if (!apiKey.trim() || !selectedProviderId) return
    setConnStatus('testing')
    setConnMessage('')
    try {
      const result = await reviewApi.testConnection(selectedProviderId, apiKey.trim())
      setConnStatus(result.success ? 'ok' : 'fail')
      setConnMessage(result.message || '')
    } catch (e) {
      setConnStatus('fail')
      setConnMessage('Network error — could not reach backend.')
    }
  }

  const handleSave = () => {
    if (!apiKey.trim()) {
      setLlmConfig(null)
    } else {
      setLlmConfig({
        provider_id: selectedProviderId,
        api_key:     apiKey.trim(),
      })
    }
    setIsOpen(false)
  }

  const handleClear = () => {
    setApiKey('')
    setLlmConfig(null)
    setConnStatus('idle')
    setIsOpen(false)
  }

  // Provider select resets connection status
  const handleSelectProvider = (id) => {
    setSelectedProviderId(id)
    setConnStatus('idle')
    setConnMessage('')
  }

  const activeProvider = llmConfig
    ? providers.find(p => p.id === llmConfig.provider_id)
    : null

  const displayName = activeProvider?.name || 'Default (NVIDIA)'

  return (
    <>
      {/* Topbar trigger button */}
      <button
        id="model-selector-btn"
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] transition-colors text-xs font-medium text-dark-300"
      >
        <Cpu size={14} className={llmConfig ? 'text-accent-400' : 'text-dark-500'} />
        <span>{displayName}</span>
        {llmConfig && (
          <span className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
        )}
        <ChevronDown size={12} className="text-dark-600" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }}
              className="relative w-full max-w-lg glass-card-accent overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-6 pb-4 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center border border-accent-500/30">
                  <Settings2 size={20} className="text-accent-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-dark-50">AI Model Settings</h3>
                  <p className="text-xs text-dark-400">Switch providers · keys stored in memory only</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-dark-500 hover:text-dark-200 transition-colors p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Provider groups */}
                <div>
                  <label className="block text-xs font-semibold text-dark-300 mb-3 uppercase tracking-wider">
                    Select Provider
                  </label>
                  <div className="space-y-3">
                    {grouped.map(({ group, providers: groupProviders }) => (
                      <div key={group}>
                        <p className="text-[10px] uppercase tracking-widest text-dark-600 font-semibold px-1 mb-1.5">
                          {group}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {groupProviders.map((p) => (
                            <button
                              key={p.id}
                              id={`provider-${p.id}`}
                              onClick={() => handleSelectProvider(p.id)}
                              className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all duration-200 ${
                                selectedProviderId === p.id
                                  ? 'bg-accent-500/10 border-accent-500/50 text-accent-300'
                                  : 'bg-dark-900/50 border-white/[0.07] text-dark-300 hover:border-white/[0.18] hover:text-dark-100'
                              }`}
                            >
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="font-medium text-sm">{p.name}</span>
                                <span className="text-[10px] text-dark-500 font-mono">{p.model}</span>
                              </div>
                              {selectedProviderId === p.id && (
                                <CheckCircle2 size={15} className="text-accent-400 shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-xs font-semibold text-dark-300 mb-2 uppercase tracking-wider">
                    API Key (Session Only)
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-600" />
                    <input
                      id="llm-api-key-input"
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value)
                        setConnStatus('idle')
                      }}
                      placeholder="sk-… / nvapi-… / gsk_…"
                      className="input-dark pl-10 pr-4"
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 px-1">
                    <Activity size={11} className="text-dark-600 shrink-0" />
                    <p className="text-[11px] text-dark-600">
                      Stored in memory only — cleared on page refresh. Never sent to any server except the selected provider.
                    </p>
                  </div>
                </div>

                {/* Connection test result */}
                <AnimatePresence>
                  {connStatus !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm ${
                        connStatus === 'ok'      ? 'bg-low/10 border border-low/25 text-low' :
                        connStatus === 'fail'    ? 'bg-critical/10 border border-critical/25 text-red-300' :
                        'bg-accent-500/10 border border-accent-500/20 text-accent-300'
                      }`}
                    >
                      {connStatus === 'testing' && <Loader2 size={14} className="animate-spin shrink-0" />}
                      {connStatus === 'ok'      && <Wifi    size={14} className="shrink-0" />}
                      {connStatus === 'fail'    && <WifiOff size={14} className="shrink-0" />}
                      <span className="text-xs font-medium">
                        {connStatus === 'testing' ? 'Testing connection…' : connMessage}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between p-6 pt-4 border-t border-white/[0.06] gap-3">
                <button
                  onClick={handleClear}
                  className="text-xs font-medium text-dark-400 hover:text-white transition-colors"
                >
                  Use Default (NVIDIA)
                </button>

                <div className="flex items-center gap-2">
                  {/* Test Connection */}
                  <button
                    id="test-connection-btn"
                    onClick={handleTestConnection}
                    disabled={!apiKey.trim() || !selectedProviderId || connStatus === 'testing'}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium
                      border border-white/[0.08] text-dark-300 bg-white/[0.02]
                      hover:bg-white/[0.06] hover:text-dark-100 transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {connStatus === 'testing' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : connStatus === 'ok' ? (
                      <Wifi size={12} className="text-low" />
                    ) : (
                      <Wifi size={12} />
                    )}
                    Test Connection
                  </button>

                  {/* Save */}
                  <button
                    id="save-model-btn"
                    onClick={handleSave}
                    className="btn-primary py-2 px-4 text-xs"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
