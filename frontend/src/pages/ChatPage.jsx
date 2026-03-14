import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { useParams } from 'react-router-dom'
import { getDocuments, getDocumentFileUrl } from '../api'
import useChat from '../hooks/useChat'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Configure pdfjs worker from local bundle for reliable Vite resolution.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString()

export default function ChatPage() {
    const { docId } = useParams()
    const [docTitle, setDocTitle] = useState('')
    const [sourcesOpen, setSourcesOpen] = useState(true)
    const [inputVal, setInputVal] = useState('')
    const [pdfPage, setPdfPage] = useState(1)
    const [showPdf, setShowPdf] = useState(!!docId)
    const [numPages, setNumPages] = useState(null)
    const [pulseChunkIdx, setPulseChunkIdx] = useState(null)
    const [pdfLoadError, setPdfLoadError] = useState('')
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)
    const pdfContainerRef = useRef(null)
    const pageRefs = useRef({})

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

    // Auto-scroll PDF to first referenced page when sources arrive
    useEffect(() => {
        if (sources.length > 0 && sources[0].page_num) {
            setPdfPage(sources[0].page_num)
            scrollPdfToPage(sources[0].page_num)
        }
    }, [sources])

    const scrollPdfToPage = useCallback((pageNum) => {
        setTimeout(() => {
            const el = pageRefs.current[pageNum]
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        }, 100)
    }, [])

    const handleSourceClick = useCallback((chunk, idx) => {
        if (chunk.page_num) {
            setPdfPage(chunk.page_num)
            setShowPdf(true)
            scrollPdfToPage(chunk.page_num)
            // Pulse the highlight
            setPulseChunkIdx(idx)
            setTimeout(() => setPulseChunkIdx(null), 800)
        }
    }, [scrollPdfToPage])

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

    const onDocumentLoadSuccess = ({ numPages: n }) => {
        setNumPages(n)
        setPdfLoadError('')
    }

    const onDocumentLoadError = (err) => {
        setPdfLoadError(err?.message || 'Failed to load PDF')
    }

    const pdfUrl = docId ? getDocumentFileUrl(docId) : null

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
                        {docId && (
                            <button
                                className="btn btn-ghost"
                                onClick={() => window.open(getDocumentFileUrl(docId), '_blank')}
                                title="Open original PDF in new tab"
                            >
                                📄 Open PDF
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
                            onClick={() => handleSourceClick(chunk, idx)}
                            style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                        >
                            <div className="source-chunk-meta">
                                <span>Page {chunk.page_num}</span>
                                {chunk.section_heading && (
                                    <span>§ {chunk.section_heading}</span>
                                )}
                                {!chunk.section_heading && chunk.section_idx !== undefined && (
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

            {/* ── PDF Viewer panel with react-pdf + highlight overlays ── */}
            {showPdf && docId && pdfUrl && (
                <aside className="pdf-viewer-panel" ref={pdfContainerRef}>
                    <div className="pdf-viewer-header">
                        <span className="pdf-viewer-title">PDF Viewer</span>
                        {numPages && (
                            <span className="pdf-viewer-page-info">
                                {numPages} pages
                            </span>
                        )}
                    </div>
                    <div className="pdf-viewer-scroll">
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <span className="spinner" /> Loading PDF…
                                </div>
                            }
                            error={
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-error)' }}>
                                    Failed to load PDF{pdfLoadError ? `: ${pdfLoadError}` : '.'}
                                </div>
                            }
                        >
                            {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                                <PdfPageWithHighlights
                                    key={pageNum}
                                    pageNum={pageNum}
                                    sources={sources}
                                    pulseChunkIdx={pulseChunkIdx}
                                    ref={el => { pageRefs.current[pageNum] = el }}
                                />
                            ))}
                        </Document>
                    </div>
                </aside>
            )}
        </div>
    )
}

/* ── PDF Page with canvas highlight overlay ─────────────────────────────── */

const PdfPageWithHighlights = forwardRef(function PdfPageWithHighlights(
    { pageNum, sources, pulseChunkIdx },
    ref
) {
    const canvasRef = useRef(null)
    const [pageDims, setPageDims] = useState(null)

    const onRenderSuccess = useCallback((page) => {
        setPageDims({
            originalWidth: page.originalWidth,
            originalHeight: page.originalHeight,
            width: page.width,
            height: page.height,
        })
    }, [])

    // Draw highlights on canvas whenever sources or pulse changes
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !pageDims) return

        const ctx = canvas.getContext('2d')
        canvas.width = pageDims.width
        canvas.height = pageDims.height
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const scaleX = pageDims.width / pageDims.originalWidth
        const scaleY = pageDims.height / pageDims.originalHeight

        // Find sources for this page that have bbox
        const pageSourcesWithBbox = (sources || [])
            .map((s, i) => ({ ...s, _idx: i }))
            .filter(s => s.page_num === pageNum && s.bbox && Array.isArray(s.bbox) && s.bbox.length === 4)

        for (const source of pageSourcesWithBbox) {
            const [x0, y0, x1, y1] = source.bbox
            const sx = x0 * scaleX
            const sy = y0 * scaleY
            const sw = (x1 - x0) * scaleX
            const sh = (y1 - y0) * scaleY

            const isPulsing = pulseChunkIdx === source._idx
            const fillAlpha = isPulsing ? 0.55 : 0.35

            ctx.fillStyle = `rgba(135, 206, 235, ${fillAlpha})`
            ctx.fillRect(sx, sy, sw, sh)
            ctx.strokeStyle = 'rgba(135, 206, 235, 0.8)'
            ctx.lineWidth = 1.5
            ctx.strokeRect(sx, sy, sw, sh)
        }
    }, [sources, pageDims, pageNum, pulseChunkIdx])

    return (
        <div
            ref={ref}
            className="pdf-page-wrapper"
            style={{ position: 'relative', marginBottom: 8 }}
        >
            <Page
                pageNumber={pageNum}
                width={560}
                onRenderSuccess={onRenderSuccess}
                renderTextLayer={true}
                renderAnnotationLayer={true}
            />
            <canvas
                ref={canvasRef}
                className="pdf-highlight-canvas"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    width: pageDims?.width || 560,
                    height: pageDims?.height || 792,
                }}
            />
        </div>
    )
})

/* ── Minimal Markdown renderer ─────────────────────────────────────────── */
function MarkdownContent({ content }) {
    const lines = content.split('\n')
    const html = lines.map(line => {
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        line = line.replace(/`([^`]+)`/g, '<code>$1</code>')
        if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`
        if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`
        if (/^# /.test(line)) return `<h1>${line.slice(2)}</h1>`
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
