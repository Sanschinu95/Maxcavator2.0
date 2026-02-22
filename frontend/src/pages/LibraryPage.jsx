import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocuments, deleteDocument } from '../api'
import StatusBadge from '../components/StatusBadge'

export default function LibraryPage() {
    const [docs, setDocs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [deletingId, setDeletingId] = useState(null)
    const navigate = useNavigate()

    const loadDocs = useCallback(async () => {
        try {
            const data = await getDocuments()
            setDocs(data.documents || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDocs()
    }, [loadDocs])

    const handleDelete = async (docId, e) => {
        e.stopPropagation()
        if (!window.confirm('Delete this document from both SQLite and ChromaDB?')) return
        setDeletingId(docId)
        try {
            await deleteDocument(docId)
            setDocs(prev => prev.filter(d => d.id !== docId))
        } catch (err) {
            alert(`Delete failed: ${err.message}`)
        } finally {
            setDeletingId(null)
        }
    }

    if (loading) return (
        <div className="page-container">
            <div className="flex items-center gap-3 text-muted" style={{ marginTop: 80 }}>
                <div className="spinner" /> Loading library…
            </div>
        </div>
    )

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Document Library</h2>
                <p>{docs.length} document{docs.length !== 1 ? 's' : ''} ingested</p>
            </div>

            {error && <div className="text-sm text-error mb-4">⚠ {error}</div>}

            {docs.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">◫</div>
                    <div className="empty-state-title">No documents yet</div>
                    <div className="empty-state-sub">
                        Go to <strong>Ingest</strong> to upload your first PDF.
                    </div>
                    <button className="btn btn-primary mt-4" onClick={() => navigate('/')} id="go-ingest-btn">
                        ⬆ Ingest a PDF
                    </button>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table className="lib-table" id="library-table">
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Pages</th>
                                <th>Words</th>
                                <th>Extract</th>
                                <th>RAG</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docs.map(doc => (
                                <tr
                                    key={doc.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/data/${doc.id}`)}
                                    id={`lib-row-${doc.id}`}
                                >
                                    <td>
                                        <div className="lib-filename">{doc.filename}</div>
                                        {doc.source_url && (
                                            <div className="text-xs text-muted font-mono" style={{ marginTop: 2 }}>
                                                {doc.source_url.length > 50
                                                    ? doc.source_url.slice(0, 50) + '…'
                                                    : doc.source_url}
                                            </div>
                                        )}
                                    </td>
                                    <td><span className="lib-stat">{doc.page_count ?? '—'}</span></td>
                                    <td><span className="lib-stat">{doc.word_count != null ? doc.word_count.toLocaleString() : '—'}</span></td>
                                    <td><StatusBadge status={doc.extract_status} /></td>
                                    <td><StatusBadge status={doc.rag_status} /></td>
                                    <td onClick={e => e.stopPropagation()}>
                                        <div className="flex gap-2 items-center">
                                            {doc.rag_status === 'done' && (
                                                <button
                                                    className="btn btn-ghost text-teal"
                                                    style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                                                    onClick={() => navigate(`/chat/${doc.id}`)}
                                                    id={`chat-doc-btn-${doc.id}`}
                                                >
                                                    ◈ Chat
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-danger"
                                                style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                                                onClick={e => handleDelete(doc.id, e)}
                                                disabled={deletingId === doc.id}
                                                id={`delete-doc-btn-${doc.id}`}
                                            >
                                                {deletingId === doc.id
                                                    ? <span className="spinner" style={{ width: 12, height: 12 }} />
                                                    : '✕ Delete'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
