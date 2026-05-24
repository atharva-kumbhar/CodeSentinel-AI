import { useState } from 'react'
import { Copy, Check, Code2, Maximize2 } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

function detectLanguage(content) {
  if (content?.includes('def ') || content?.includes('import ') && content?.includes(':')) return 'python'
  if (content?.includes('function') || content?.includes('=>') || content?.includes('const ')) return 'javascript'
  if (content?.includes('interface ') || content?.includes(': string') || content?.includes(': number')) return 'typescript'
  if (content?.includes('public class') || content?.includes('System.out')) return 'java'
  if (content?.includes('fn ') && content?.includes('let mut')) return 'rust'
  if (content?.includes('func ') && content?.includes(':= ')) return 'go'
  return 'text'
}

export default function CodeViewer({ code, title = 'Optimized Code', filename }) {
  const [copied, setCopied] = useState(false)
  const language = filename
    ? filename.split('.').pop()?.toLowerCase() || 'text'
    : detectLanguage(code)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!code?.trim()) {
    return (
      <div className="glass-card p-8 flex flex-col items-center text-center">
        <Code2 size={32} className="text-dark-700 mb-3" />
        <p className="text-dark-500 text-sm">No optimized code snippet available for this review.</p>
      </div>
    )
  }

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="code-block-header">
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-critical/70" />
            <div className="w-3 h-3 rounded-full bg-medium/70" />
            <div className="w-3 h-3 rounded-full bg-low/70" />
          </div>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <Code2 size={13} />
          <span className="font-semibold">{title}</span>
          {filename && (
            <span className="text-dark-600 font-mono text-[11px] ml-1">— {filename}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-dark-600 text-[11px] font-mono mr-2">
            {language.toUpperCase()}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] transition-colors text-dark-400 hover:text-dark-200"
          >
            {copied ? (
              <><Check size={11} className="text-low" /><span className="text-[11px]">Copied</span></>
            ) : (
              <><Copy size={11} /><span className="text-[11px]">Copy</span></>
            )}
          </button>
        </div>
      </div>

      {/* Code */}
      <div className="overflow-auto max-h-[500px]">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: '20px 16px',
            background: '#07070f',
            fontSize: '12.5px',
            lineHeight: '1.7',
            minHeight: '120px',
          }}
          lineNumberStyle={{
            color: '#2a2a4a',
            fontSize: '11px',
            paddingRight: '16px',
            minWidth: '40px',
          }}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
