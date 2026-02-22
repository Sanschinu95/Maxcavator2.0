import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ingestFile, ingestUrl } from '../api'
import ProgressTracker from '../components/ProgressTracker'
import useJobStatus from '../hooks/useJobStatus'

export default function IngestPage() {
    const [dragOver, setDragOver] = useState(false)
    const [urlInput, setUrlInput] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [jobId, setJobId] = useState(null)
    const [docId, setDocId] = useState(null)
    const [filename, setFilename] = useState('')
    const fileRef = useRef(null)
    const navigate = useNavigate()

    const { job } = useJobStatus(jobId)

    const bothDone = job && job.extract_status === 'done' && job.rag_status === 'done'

    const handleFile = async (file) => {
        if (!file) return
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setError('Only PDF files are accepted.')
            return
        }
        setError('')
        setSubmitting(true)
        setJobId(null)
        setDocId(null)
        try {
            const result = await ingestFile(file)
            setJobId(result.job_id)
            setDocId(result.doc_id)
            setFilename(result.filename)
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleUrlSubmit = async (e) => {
        e.preventDefault()
        if (!urlInput.trim()) return
        setError('')
        setSubmitting(true)
        setJobId(null)
        setDocId(null)
        try {
            const result = await ingestUrl(urlInput.trim())
            setJobId(result.job_id)
            setDocId(result.doc_id)
            setFilename(result.filename)
            setUrlInput('')
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const onDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Ingest Document</h2>
                <p>Upload a PDF file or provide a URL to start processing.</p>
            </div>

            {/* Drop Zone */}
            <div
                className={`drop-zone${dragOver ? ' drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                id="pdf-drop-zone"
                role="button"
                tabIndex={0}
                aria-label="PDF drop zone"
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    id="pdf-file-input"
                    onChange={e => handleFile(e.target.files[0])}
                />
                <span className="drop-zone-icon">
                    {submitting ? '⟳' : '⬆'}
                </span>
                <div className="drop-zone-title">
                    {submitting ? 'Uploading…' : 'Drop PDF here or click to browse'}
                </div>
                <div className="drop-zone-sub">
                    PDF files up to any size · Text + Tables + Embeddings extracted automatically
                </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mt-4 mb-4">
                <div className="divider" style={{ flex: 1, margin: 0 }} />
                <span className="text-xs text-muted">or paste a URL</span>
                <div className="divider" style={{ flex: 1, margin: 0 }} />
            </div>

            {/* URL Input */}
            <form onSubmit={handleUrlSubmit} className="flex gap-3">
                <input
                    className="input"
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    id="pdf-url-input"
                    disabled={submitting}
                />
                <button
                    type="submit"
                    className="btn btn-secondary"
                    disabled={submitting || !urlInput.trim()}
                    id="ingest-url-btn"
                    style={{ flexShrink: 0 }}
                >
                    {submitting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Fetching…</> : 'Ingest URL'}
                </button>
            </form>

            {/* Error */}
            {error && (
                <div className="mt-3 text-sm text-error" id="ingest-error">
                    ⚠ {error}
                </div>
            )}

            {/* Pipeline Progress */}
            {jobId && (
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="label">Processing</span>
                            <span className="font-mono text-xs text-muted" style={{ marginLeft: 10 }}>
                                {filename}
                            </span>
                        </div>
                        {bothDone && (
                            <div className="flex gap-2">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigate(`/data/${docId}`)}
                                    id="view-data-btn"
                                >
                                    View Data
                                </button>
                                <button
                                    className="btn btn-teal"
                                    onClick={() => navigate(`/chat/${docId}`)}
                                    id="start-chat-btn"
                                >
                                    ◈ Start Chat
                                </button>
                            </div>
                        )}
                    </div>
                    <ProgressTracker job={job} />
                </div>
            )}
        </div>
    )
}
