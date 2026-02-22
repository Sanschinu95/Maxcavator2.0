import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { getDocuments } from '../api'

const NAV_ITEMS = [
    { to: '/', icon: '⬆', label: 'Ingest' },
    { to: '/library', icon: '◫', label: 'Library' },
    { to: '/chat', icon: '◈', label: 'Chat' },
]

export default function Sidebar() {
    const [docs, setDocs] = useState([])
    const navigate = useNavigate()
    const params = useParams()

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const data = await getDocuments()
                if (!cancelled) setDocs(data.documents || [])
            } catch {
                /* silently fail — sidebar is non-critical */
            }
        }
        load()
        const id = setInterval(load, 5000)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    const selectedDocId = params.docId || null

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <h1>Max<span>cavator</span></h1>
                <div className="tagline">PDF Intelligence Platform</div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
                {NAV_ITEMS.map(({ to, icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `sidebar-nav-item${isActive ? ' active' : ''}`
                        }
                        end={to === '/'}
                        id={`nav-${label.toLowerCase()}`}
                    >
                        <span className="nav-icon">{icon}</span>
                        {label}
                    </NavLink>
                ))}
            </nav>

            {/* Document List */}
            <div className="sidebar-doc-section">
                <div className="sidebar-section-label">Documents</div>
                {docs.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        No documents yet
                    </div>
                ) : (
                    docs.map((doc) => {
                        const isActive = selectedDocId === doc.id
                        return (
                            <div
                                key={doc.id}
                                className={`sidebar-doc-item${isActive ? ' active' : ''}`}
                                onClick={() => navigate(`/data/${doc.id}`)}
                                role="button"
                                tabIndex={0}
                                id={`doc-item-${doc.id}`}
                                onKeyDown={e => e.key === 'Enter' && navigate(`/data/${doc.id}`)}
                                title={doc.filename}
                            >
                                <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>◻</span>
                                <span className="sidebar-doc-name">{doc.filename}</span>
                                {doc.rag_status === 'done' && (
                                    <span
                                        className="btn-ghost"
                                        style={{ padding: '2px 6px', fontSize: '0.7rem', color: 'var(--accent-teal)' }}
                                        onClick={e => { e.stopPropagation(); navigate(`/chat/${doc.id}`) }}
                                        title="Chat with this document"
                                    >
                                        ◈
                                    </span>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </aside>
    )
}
