import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocuments, deleteDocument } from '../api'
import StatusBadge from '../components/StatusBadge'

export default function LibraryPage() {
    const [docs, setDocs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const navigate = useNavigate()

    const load = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getDocuments()
            setDocs(data.documents || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const handleDelete = async (docId, e) => {
        e.stopPropagation()
        if (!confirm('Delete this document and all its data?')) return
        setDeleting(docId)
        try {
            await deleteDocument(docId)
            setDocs(prev => prev.filter(d => d.document_id !== docId))
        } catch (err) {
            alert(err.message)
        } finally {
            setDeleting(null)
        }
    }

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h2>Library</h2>
                </div>
                <div className="doc-grid">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="doc-card">
                            <div className="skeleton" style={{ height: 20, width: '70%', marginBottom: 10 }} />
                            <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 16 }} />
                            <div className="skeleton" style={{ height: 12, width: '90%' }} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="page-header"><h2>Library</h2></div>
                <div className="error-msg">Failed to load documents: {error}</div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="flex items-center justify-between">
                    <div>
                        <h2>Library</h2>
                        <p>{docs.length} document{docs.length !== 1 ? 's' : ''} ingested</p>
                    </div>
                    <button className="btn btn-secondary" onClick={load} id="refresh-library-btn">
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {docs.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">No documents yet</div>
                    <div className="empty-state-desc">
                        Head to the Ingest page to upload your first PDF.
                    </div>
                </div>
            ) : (
                <div className="doc-grid">
                    {docs.map(doc => {
                        const meta = doc.metadata || {}
                        const job = doc.job || {}
                        const title = meta.title || doc.filename || 'Untitled'
                        const extract = job.extract_status || 'pending'
                        const rag = job.rag_status || 'pending'

                        return (
                            <div
                                key={doc.document_id}
                                className="doc-card"
                                id={`doc-card-${doc.document_id}`}
                            >
                                <div className="doc-card-title" title={title}>{title}</div>

                                <div className="doc-card-meta">
                                    {meta.page_count > 0 && <span>{meta.page_count} pages</span>}
                                    {meta.word_count > 0 && <span>{meta.word_count.toLocaleString()} words</span>}
                                    {meta.section_count > 0 && <span>{meta.section_count} sections</span>}
                                </div>

                                <div className="doc-card-badges">
                                    <StatusBadge status={extract} label={`Extract: ${extract}`} />
                                    <StatusBadge status={rag} label={`RAG: ${rag}`} />
                                </div>

                                {meta.author && (
                                    <div className="text-xs text-muted font-mono mb-3">
                                        by {meta.author}
                                    </div>
                                )}

                                <div className="doc-card-actions">
                                    <button
                                        className="btn btn-danger"
                                        onClick={(e) => handleDelete(doc.document_id, e)}
                                        disabled={deleting === doc.document_id}
                                        id={`delete-doc-${doc.document_id}`}
                                        title="Delete document"
                                    >
                                        {deleting === doc.document_id ? '…' : '🗑'}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => navigate(`/explore/${doc.document_id}`)}
                                        id={`explore-doc-${doc.document_id}`}
                                    >
                                        Explore
                                    </button>
                                    <button
                                        className="btn btn-amber"
                                        onClick={() => navigate(`/chat/${doc.document_id}`)}
                                        disabled={rag !== 'done'}
                                        id={`chat-doc-${doc.document_id}`}
                                    >
                                        ◈ Chat
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
