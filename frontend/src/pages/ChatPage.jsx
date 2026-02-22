import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocuments } from '../api'
import useChat from '../hooks/useChat'
import ChatWindow from '../components/ChatWindow'
import SourceChunks from '../components/SourceChunks'

export default function ChatPage() {
    const { docId } = useParams()
    const navigate = useNavigate()
    const [docs, setDocs] = useState([])
    const [selectedDocId, setSelectedDocId] = useState(docId || '')
    const { messages, sources, isStreaming, sendMessage, clearHistory } = useChat()

    useEffect(() => {
        getDocuments()
            .then(data => setDocs((data.documents || []).filter(d => d.rag_status === 'done')))
            .catch(() => { })
    }, [])

    // Sync selected doc with URL param
    useEffect(() => {
        if (docId) setSelectedDocId(docId)
    }, [docId])

    const handleSend = (text) => {
        sendMessage(text, selectedDocId || null)
    }

    const handleDocChange = (e) => {
        const id = e.target.value
        setSelectedDocId(id)
        clearHistory()
        if (id) navigate(`/chat/${id}`, { replace: true })
        else navigate('/chat', { replace: true })
    }

    const selectedDoc = docs.find(d => d.id === selectedDocId)

    return (
        <div className="page-container" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem' }}>RAG Chat</h2>
                    {selectedDoc && (
                        <p className="font-mono text-xs text-muted mt-1">{selectedDoc.filename}</p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Document selector */}
                    <select
                        className="input"
                        style={{ width: 220 }}
                        value={selectedDocId}
                        onChange={handleDocChange}
                        id="chat-doc-selector"
                    >
                        <option value="">— All documents —</option>
                        {docs.map(d => (
                            <option key={d.id} value={d.id}>{d.filename}</option>
                        ))}
                    </select>

                    {messages.length > 0 && (
                        <button
                            className="btn btn-ghost"
                            onClick={() => { clearHistory(); }}
                            disabled={isStreaming}
                            id="clear-chat-btn"
                            title="Clear conversation"
                        >
                            ↺ Clear
                        </button>
                    )}
                </div>
            </div>

            {/* No RAG-ready docs warning */}
            {docs.length === 0 && (
                <div className="card-sm mb-4" style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }}>
                    <span className="text-xs text-warning">
                        ⚠ No documents with completed RAG indexing found.{' '}
                        <span
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => navigate('/')}
                        >
                            Ingest a PDF first.
                        </span>
                    </span>
                </div>
            )}

            {/* Chat layout */}
            <div className="chat-layout" style={{ flex: 1, minHeight: 0 }}>
                <ChatWindow
                    messages={messages}
                    onSend={handleSend}
                    isStreaming={isStreaming}
                />

                <aside className="sources-panel">
                    <div className="sources-panel-header">
                        <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>◈</span>
                        <h3>Source Chunks</h3>
                        {sources.length > 0 && (
                            <span className="text-xs text-muted font-mono" style={{ marginLeft: 'auto' }}>
                                {sources.length} retrieved
                            </span>
                        )}
                    </div>
                    <div className="sources-panel-body">
                        <SourceChunks chunks={sources} />
                    </div>
                </aside>
            </div>
        </div>
    )
}
