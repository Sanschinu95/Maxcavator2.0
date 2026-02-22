import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMetadata } from '../api'
import PagesBrowser from '../components/PagesBrowser'
import TablesViewer from '../components/TablesViewer'

const TABS = ['Pages', 'Tables', 'Metadata']

export default function DataViewPage() {
    const { docId } = useParams()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('Pages')
    const [meta, setMeta] = useState(null)

    useEffect(() => {
        if (!docId) return
        getMetadata(docId)
            .then(setMeta)
            .catch(() => { })
    }, [docId])

    if (!docId) {
        return (
            <div className="page-container">
                <div className="empty-state">
                    <div className="empty-state-icon">◧</div>
                    <div className="empty-state-title">No document selected</div>
                    <div className="empty-state-sub">Choose a document from the sidebar or library.</div>
                    <button className="btn btn-primary mt-4" onClick={() => navigate('/library')} id="go-library-btn">
                        View Library
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div className="flex items-center justify-between">
                    <div>
                        <h2>{meta?.filename || 'Document'}</h2>
                        <p className="font-mono text-xs text-muted mt-1">
                            {meta ? `${meta.page_count} pages · ${(meta.word_count || 0).toLocaleString()} words` : 'Loading…'}
                        </p>
                    </div>
                    <button
                        className="btn btn-teal"
                        onClick={() => navigate(`/chat/${docId}`)}
                        id="open-chat-btn"
                    >
                        ◈ Chat with this doc
                    </button>
                </div>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" role="tablist">
                {TABS.map(tab => (
                    <button
                        key={tab}
                        className={`tab-btn${activeTab === tab ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                        role="tab"
                        aria-selected={activeTab === tab}
                        id={`tab-${tab.toLowerCase()}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div role="tabpanel">
                {activeTab === 'Pages' && <PagesBrowser docId={docId} />}
                {activeTab === 'Tables' && <TablesViewer docId={docId} />}
                {activeTab === 'Metadata' && <MetadataPanel meta={meta} />}
            </div>
        </div>
    )
}

function MetadataPanel({ meta }) {
    if (!meta) return (
        <div className="flex items-center gap-3 text-muted text-sm">
            <div className="spinner" /> Loading metadata…
        </div>
    )

    const skip = new Set(['doc_id'])
    const entries = Object.entries(meta).filter(([k]) => !skip.has(k) && meta[k] !== '' && meta[k] != null)

    return (
        <div className="meta-grid">
            {entries.map(([key, value]) => (
                <div key={key} className="meta-item">
                    <div className="meta-key">{key.replace(/_/g, ' ')}</div>
                    <div className="meta-val">{String(value)}</div>
                </div>
            ))}
        </div>
    )
}
