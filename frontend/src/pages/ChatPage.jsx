import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getDocuments } from '../api'
import useChat from '../hooks/useChat'

export default function ChatPage() {
    const { docId } = useParams()
    const [docTitle, setDocTitle] = useState('')
    const [sourcesOpen, setSourcesOpen] = useState(true)
    const [inputVal, setInputVal] = useState('')
    const [pdfPage, setPdfPage] = useState(1)
    const [showPdf, setShowPdf] = useState(!!docId)
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)

    const { messages, sources, streaming, error, send, clear } = useChat(docId)

    // Resolve document title for header badge
    useEffect(() => {
        if (!docId) return
        getDocuments()
            .then(data => {
                const doc = (data.documents || []).find(d => d.document_id === docId)
                if (doc) setDocTitle(doc.metadata?.title || doc.filename || docId)
            })
            .catch(() => setDocTitle(docId))
    }, [docId])

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
        const q = inputVal.trim()
        if (!q || streaming) return
        setInputVal('')
        send(q)
        textareaRef.current?.focus()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="chat-shell">
            {/* ── Chat main ─────────────────────────────────────────── */}
            <div className="chat-main">
                {/* Header */}
                <div className="chat-header">
                    <div className="flex items-center gap-3">
                        <h2>Chat</h2>
                        {docTitle && (
                            <span className="chat-doc-badge" title={docTitle}>
                                📄 {docTitle}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {messages.length > 0 && (
                            <button
                                className="btn btn-ghost"
                                onClick={clear}
                                id="clear-chat-btn"
                                title="Clear conversation"
                            >
                                ✕ Clear
                            </button>
                        )}
                        <button
                            className="btn btn-ghost"
                            onClick={() => setShowPdf(o => !o)}
                            title="Toggle PDF Viewer"
                            style={{ display: docId ? 'inline-flex' : 'none' }}
                        >
                            {showPdf ? 'Hide PDF' : 'Show PDF'}
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={() => setSourcesOpen(o => !o)}
                            id="toggle-sources-btn"
                            title="Toggle sources panel"
                        >
                            {sourcesOpen ? '◧' : '◨'} Sources
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="chat-messages" id="chat-messages">
                    {messages.length === 0 && (
                        <div className="empty-state" style={{ margin: 'auto' }}>
                            <div className="empty-state-icon">◈</div>
                            <div className="empty-state-title">Start a conversation</div>
                            <div className="empty-state-desc">
                                {docId
                                    ? 'Ask anything about this document. Maxcavator will cite section headings and page numbers.'
                                    : 'Ask anything across all your ingested documents.'}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`chat-bubble ${msg.role}`}
                            id={`chat-msg-${idx}`}
                        >
                            {msg.role === 'assistant' ? (
                                <MarkdownContent content={msg.content} />
                            ) : (
                                msg.content
                            )}
                        </div>
                    ))}

                    {streaming && messages.length > 0 && !messages[messages.length - 1].content && (
                        <div className="chat-bubble assistant">
                            <span className="spinner" style={{ width: 14, height: 14 }} />
                        </div>
                    )}

                    {error && (
                        <div className="error-msg" id="chat-error">⚠ {error}</div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="chat-input-area">
                    <textarea
                        ref={textareaRef}
                        className="chat-textarea"
                        placeholder={streaming ? 'Maxcavator is thinking…' : 'Ask a question about the document…'}
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={streaming}
                        rows={1}
                        id="chat-input"
                    />
                    <button
                        className="btn btn-amber"
                        onClick={handleSend}
                        disabled={streaming || !inputVal.trim()}
                        id="send-chat-btn"
                        style={{ flexShrink: 0 }}
                    >
                        {streaming
                            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Thinking</>
                            : '↑ Send'}
                    </button>
                </div>
            </div>

            {/* ── Sources panel ──────────────────────────────────────── */}
            <aside className={`sources-panel${sourcesOpen ? '' : ' collapsed'}`}>
                <div className="sources-header">
                    <h3>Sources</h3>
                    <button
                        className="btn btn-ghost"
                        onClick={() => setSourcesOpen(false)}
                        style={{ padding: '4px 8px' }}
                    >✕</button>
                </div>

                <div className="sources-body" id="sources-body">
                    {sources.length === 0 ? (
                        <div className="text-muted text-xs" style={{ padding: '16px 4px', lineHeight: 1.6 }}>
                            Source chunks will appear here after each response.
                        </div>
                    ) : sources.map((chunk, idx) => (
                        <div
                            key={idx}
                            className="source-chunk hoverable"
                            id={`source-chunk-${idx}`}
                            onClick={() => {
                                if (chunk.page_num) {
                                    setPdfPage(chunk.page_num)
                                    setShowPdf(true)
                                }
                            }}
                            style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                        >
                            <div className="source-chunk-meta">
                                <span>Page {chunk.page_num}</span>
                                {chunk.section_idx !== undefined && (
                                    <span>§ {chunk.section_idx + 1}</span>
                                )}
                                <span style={{ opacity: 0.6 }}>
                                    {(1 - chunk.distance).toFixed(2)} relevance
                                </span>
                            </div>
                            <div className="source-chunk-text">{chunk.text}</div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* ── PDF panel ──────────────────────────────────────────── */}
            {showPdf && docId && (
                <aside className="pdf-panel" style={{ flex: 1.5, borderLeft: '1px solid var(--border)', background: 'var(--bg-base)', maxWidth: '50%' }}>
                    <iframe
                        src={`http://localhost:8000/pdfs/${docId}.pdf#page=${pdfPage}&view=FitH`}
                        width="100%"
                        height="100%"
                        style={{ border: 'none' }}
                    />
                </aside>
            )}
        </div>
    )
}

/* ── Minimal Markdown renderer ─────────────────────────────────────────── */
function MarkdownContent({ content }) {
    // Simple inline markdown without heavy library
    // Handle bold, code, and preserve paragraphs
    const lines = content.split('\n')
    const html = lines.map(line => {
        // Bold
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Inline code
        line = line.replace(/`([^`]+)`/g, '<code>$1</code>')
        // Headers
        if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`
        if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`
        if (/^# /.test(line)) return `<h1>${line.slice(2)}</h1>`
        // List items
        if (/^[-*] /.test(line)) return `<li>${line.slice(2)}</li>`
        if (/^\d+\. /.test(line)) return `<li>${line.replace(/^\d+\. /, '')}</li>`
        return line || ''
    }).join('\n')

    return (
        <div
            dangerouslySetInnerHTML={{ __html: html.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, ' ') }}
        />
    )
}
