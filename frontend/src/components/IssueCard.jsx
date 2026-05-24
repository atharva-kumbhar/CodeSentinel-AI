import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronRight, FileCode, MapPin, Wrench,
  Info, Copy, Check, Sparkles, RefreshCw, SplitSquareHorizontal,
  GitBranch, ExternalLink, Loader2, AlertTriangle,
} from 'lucide-react'
import SeverityBadge from './SeverityBadge'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { reviewApi } from '../api/reviewApi'

// Detect language from filename
function detectLanguage(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    cs: 'csharp', cpp: 'cpp', c: 'c', rb: 'ruby', php: 'php',
    sh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json', md: 'markdown',
    html: 'html', css: 'css', sql: 'sql', dockerfile: 'docker',
  }
  return map[ext] || 'text'
}

function CopyButton({ text, label = '' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-dark-500 hover:text-dark-200"
      title={`Copy ${label}`}
    >
      {copied ? <Check size={12} className="text-low" /> : <Copy size={12} />}
      {label && <span className="text-[10px] font-medium">{copied ? 'Copied' : label}</span>}
    </button>
  )
}

// Inline code pane with header
function CodePane({ title, code, lang, tint }) {
  return (
    <div className={`flex-1 min-w-0 rounded-xl overflow-hidden border ${
      tint === 'red'   ? 'border-red-500/20'   :
      tint === 'green' ? 'border-low/20'        :
      'border-white/[0.07]'
    }`}>
      <div className={`flex items-center justify-between px-3 py-2 text-xs font-semibold ${
        tint === 'red'   ? 'bg-red-500/10 text-red-400'  :
        tint === 'green' ? 'bg-low/10 text-low'           :
        'bg-white/[0.03] text-dark-400'
      }`}>
        <span>{title}</span>
        <CopyButton text={code} />
      </div>
      <div className="bg-[#0a0a1a]">
        <SyntaxHighlighter
          language={lang}
          style={oneDark}
          customStyle={{
            margin: 0, padding: '12px 16px',
            background: 'transparent',
            fontSize: '11.5px', lineHeight: '1.65',
          }}
          wrapLongLines
        >
          {code || '// no code'}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

// ── Push to Branch Button ────────────────────────────────────────────────────
function PushToGitHubButton({ issue, fixedCode, prUrl }) {
  const [state, setState]       = useState('idle')   // idle | confirm | loading | success | error
  const [commitUrl, setCommitUrl] = useState(null)
  const [commitInfo, setCommitInfo] = useState('')     // "abc1234 → feature/branch"
  const [errorMsg, setErrorMsg]   = useState('')

  // Only show when we have all required data
  const canPush = prUrl && issue.file && issue.file !== 'unknown' && fixedCode?.trim()
  if (!canPush) return null

  const handleConfirm = () => setState('confirm')
  const handleCancel  = () => setState('idle')

  const handlePush = async () => {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await reviewApi.pushFix({
        prUrl,
        filePath:  issue.file,
        fixedCode,
        issueTitle: issue.issue,
      })
      if (res.success) {
        setState('success')
        setCommitUrl(res.commit_url)
        setCommitInfo(`${res.commit_sha} → ${res.branch}`)
      } else {
        setState('error')
        setErrorMsg(res.message || 'Push failed.')
      }
    } catch (e) {
      setState('error')
      setErrorMsg(e.response?.data?.detail || e.message || 'Failed to push to GitHub.')
    }
  }

  if (state === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-low/10 border border-low/25"
      >
        <Check size={13} className="text-low shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-low">Committed to GitHub!</p>
          <p className="text-[10px] text-dark-500 font-mono truncate">{commitInfo}</p>
        </div>
        {commitUrl && (
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-accent-300 hover:text-accent-200 shrink-0"
          >
            View commit <ExternalLink size={9} />
          </a>
        )}
      </motion.div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
        <AlertTriangle size={12} className="text-red-400 shrink-0" />
        <p className="text-[10px] text-red-400 flex-1">{errorMsg}</p>
        <button onClick={() => setState('idle')} className="text-[10px] text-dark-500 hover:text-dark-300 shrink-0">Dismiss</button>
      </div>
    )
  }

  if (state === 'confirm') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25"
      >
        <p className="text-xs font-semibold text-amber-300 mb-1">⚠️ Confirm Push to GitHub</p>
        <p className="text-[10px] text-dark-400 mb-3">
          This will create a commit on the PR branch replacing{' '}
          <span className="font-mono text-dark-200">{issue.file}</span> with the AI fix.
          This action cannot be undone from here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handlePush}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors border border-amber-500/30"
          >
            <GitBranch size={11} /> Yes, push commit
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-dark-400 hover:text-dark-200
              border border-white/[0.07] hover:border-white/[0.12] transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    )
  }

  // idle state
  return (
    <button
      onClick={handleConfirm}
      title={`Commit AI fix directly to the PR branch — replaces ${issue.file} on GitHub`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        text-amber-300 bg-amber-500/10 hover:bg-amber-500/20
        transition-colors border border-amber-500/20 hover:border-amber-500/30"
    >
      <GitBranch size={11} />
      Push to Branch
    </button>
  )
}

// ── Post to GitHub Button ────────────────────────────────────────────────────
function PostToGitHubButton({ issue, fixedCode, prUrl }) {
  const [state, setState] = useState('idle') // idle | loading | success | error
  const [commentUrl, setCommentUrl] = useState(null)
  const [errorMsg, setErrorMsg]     = useState('')

  // Can only post if we have: file, line, fixedCode, and prUrl
  const canPost = (
    prUrl &&
    issue.file && issue.file !== 'unknown' &&
    issue.line > 0 &&
    fixedCode?.trim()
  )

  if (!canPost) return null

  const handlePost = async () => {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await reviewApi.postSuggestion({
        prUrl,
        filePath:    issue.file,
        line:        issue.line,
        fixedCode,
        issueTitle:  issue.issue,
        explanation: issue.explanation,
        severity:    issue.severity,
      })
      if (res.success) {
        setState('success')
        setCommentUrl(res.comment_url)
      } else {
        setState('error')
        setErrorMsg(res.message || 'Failed to post suggestion.')
      }
    } catch (e) {
      setState('error')
      setErrorMsg(e.response?.data?.detail || e.message || 'Failed to post to GitHub.')
    }
  }

  if (state === 'success') {
    return (
      <motion.a
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        href={commentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          text-low bg-low/10 hover:bg-low/20 transition-colors border border-low/25"
      >
        <Check size={11} />
        Posted! View on GitHub
        <ExternalLink size={10} />
      </motion.a>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] text-red-400">
          <AlertTriangle size={10} /> {errorMsg}
        </span>
        <button
          onClick={handlePost}
          className="text-[10px] text-dark-500 hover:text-dark-300 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handlePost}
      disabled={state === 'loading'}
      title="Post this AI fix as a GitHub Suggestion — PR author can apply it with one click on GitHub"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        text-dark-300 bg-white/[0.04] hover:bg-white/[0.08] hover:text-white
        transition-colors border border-white/[0.08] hover:border-white/[0.15]
        disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {state === 'loading' ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <GitBranch size={11} />
      )}
      {state === 'loading' ? 'Posting…' : 'Post to GitHub'}
    </button>
  )
}

// ── Main IssueCard ────────────────────────────────────────────────────────────
export default function IssueCard({ issue, index, llmConfig, prUrl }) {
  const [expanded, setExpanded]         = useState(index < 2)
  const [generatingFix, setGenerating]  = useState(false)
  const [originalCode, setOriginalCode] = useState('')
  const [fixedCode, setFixedCode]       = useState(issue.fix || '')
  const [fixExplanation, setFixExpl]    = useState('')
  const [splitView, setSplitView]       = useState(false)
  const lang = detectLanguage(issue.file)

  const handleGenerateFix = async () => {
    setGenerating(true)
    try {
      const res = await reviewApi.generateFix(issue, null, null, llmConfig)
      if (res.fixed_code)   setFixedCode(res.fixed_code)
      if (res.original_code) setOriginalCode(res.original_code)
      if (res.explanation)  setFixExpl(res.explanation)
      // Auto-switch to split view when we have both sides
      if (res.original_code && res.fixed_code) setSplitView(true)
    } catch (e) {
      console.error('Failed to generate AI fix', e)
    } finally {
      setGenerating(false)
    }
  }

  const borderColorMap = {
    Critical: 'border-l-critical',
    High:     'border-l-high',
    Medium:   'border-l-medium',
    Low:      'border-l-low',
  }

  return (
    <div
      className={`
        glass-card border-l-4 ${borderColorMap[issue.severity] || 'border-l-dark-700'}
        overflow-hidden transition-all duration-300 animate-slide-up
        hover:border-white/10
      `}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded(!expanded)}
        id={`issue-${index}`}
      >
        <SeverityBadge severity={issue.severity} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-dark-100 truncate">{issue.issue}</span>
            <span className="text-xs text-dark-500 bg-white/[0.04] px-2 py-0.5 rounded-md font-mono shrink-0">
              {issue.type}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
            <span className="flex items-center gap-1">
              <FileCode size={11} />
              <span className="font-mono truncate max-w-[200px]">{issue.file}</span>
            </span>
            {issue.line > 0 && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                Line {issue.line}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-dark-600">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="border-t border-white/[0.05]"
          >
            <div className="space-y-4 p-4">
              {/* Explanation */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Info size={13} className="text-info" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1">Explanation</p>
                  <p className="text-sm text-dark-300 leading-relaxed">{issue.explanation}</p>
                </div>
              </div>

              {/* Fix section */}
              {fixedCode && (
                <div>
                  {/* Fix header row */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-low/10 flex items-center justify-center shrink-0">
                        <Wrench size={13} className="text-low" />
                      </div>
                      <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Suggested Fix</p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Split view toggle — only show when we have both sides */}
                      {originalCode && (
                        <button
                          onClick={() => setSplitView(!splitView)}
                          title={splitView ? 'Single view' : 'Before/After view'}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            splitView
                              ? 'bg-accent-500/15 text-accent-300 border border-accent-500/25'
                              : 'text-dark-500 hover:text-dark-200 border border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          <SplitSquareHorizontal size={11} />
                          Split
                        </button>
                      )}

                      {/* Regenerate / Apply AI Fix */}
                      <button
                        onClick={handleGenerateFix}
                        disabled={generatingFix}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent-300 bg-accent-500/10 hover:bg-accent-500/20 transition-colors disabled:opacity-50 border border-accent-500/20"
                      >
                        {generatingFix ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        {generatingFix ? 'Generating…' : originalCode ? 'Regenerate' : 'Apply AI Fix'}
                      </button>

                      {/* ── Post to GitHub as Suggestion ── */}
                      <PostToGitHubButton
                        issue={issue}
                        fixedCode={fixedCode}
                        prUrl={prUrl}
                      />

                      <CopyButton text={fixedCode} />
                    </div>
                  </div>

                  {/* AI Note */}
                  {fixExplanation && (
                    <div className="mb-3 p-3 rounded-lg bg-dark-900/80 border border-white/[0.05] text-xs text-dark-300">
                      <span className="font-semibold text-dark-200">AI Note: </span>
                      {fixExplanation}
                    </div>
                  )}

                  {/* GitHub Suggestion hint */}
                  {prUrl && issue.file && issue.file !== 'unknown' && issue.line > 0 && (
                    <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[10px] text-dark-600">
                      <GitBranch size={10} className="shrink-0 mt-0.5 text-dark-500" />
                      <span>
                        <strong className="text-dark-400">Post to GitHub</strong> posts this fix as a native
                        GitHub Suggestion — the PR author sees an{' '}
                        <span className="font-mono bg-white/[0.06] px-1 rounded">Apply suggestion</span>{' '}
                        button and can commit it with one click, directly on GitHub.
                      </span>
                    </div>
                  )}

                  {/* Code display — split or single */}
                  {splitView && originalCode ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <CodePane title="Before (Original)" code={originalCode} lang={lang} tint="red" />
                      <CodePane title="After (Fixed)"     code={fixedCode}    lang={lang} tint="green" />
                    </motion.div>
                  ) : (
                    <div className="code-block text-xs">
                      <SyntaxHighlighter
                        language={lang}
                        style={oneDark}
                        customStyle={{
                          margin: 0, padding: '12px 16px',
                          background: 'transparent',
                          fontSize: '12px', lineHeight: '1.6',
                        }}
                        wrapLongLines
                      >
                        {fixedCode}
                      </SyntaxHighlighter>
                    </div>
                  )}

                  {/* ── Push to Branch button + Suggestion button row ──────── */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-dark-600">
                        Apply this fix directly on GitHub:
                      </p>
                    </div>
                    {/* Post as Suggestion (Apply suggestion button on GitHub) */}
                    <PostToGitHubButton issue={issue} fixedCode={fixedCode} prUrl={prUrl} />
                    {/* Push as a real commit to PR branch */}
                    <PushToGitHubButton issue={issue} fixedCode={fixedCode} prUrl={prUrl} />
                  </div>

                </div>
              )}

              {/* Generate fix button when no fix yet */}
              {!fixedCode && (
                <button
                  onClick={handleGenerateFix}
                  disabled={generatingFix}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-accent-300 bg-accent-500/10 hover:bg-accent-500/20 transition-colors disabled:opacity-50 border border-accent-500/20 w-full justify-center"
                >
                  {generatingFix
                    ? <><RefreshCw size={14} className="animate-spin" /> Generating AI Fix…</>
                    : <><Sparkles size={14} /> Generate AI Fix</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
