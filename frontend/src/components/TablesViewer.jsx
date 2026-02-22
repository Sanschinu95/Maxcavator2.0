import { useState, useEffect } from 'react'
import { getTables } from '../api'

/**
 * TablesViewer — renders extracted HTML tables from the document.
 * Uses dangerouslySetInnerHTML but tables come from our own PyMuPDF extraction,
 * so the HTML is trusted (pandas .to_html() output).
 */
export default function TablesViewer({ docId }) {
    const [tables, setTables] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')
        getTables(docId)
            .then(data => { if (!cancelled) setTables(data.tables || []) })
            .catch(err => { if (!cancelled) setError(err.message) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [docId])

    if (loading) return (
        <div className="flex items-center gap-3 text-muted text-sm" style={{ padding: '40px 0' }}>
            <div className="spinner" /> Loading tables…
        </div>
    )

    if (error) return (
        <div className="empty-state">
            <div className="empty-state-icon">⚠</div>
            <div className="empty-state-title text-error">{error}</div>
        </div>
    )

    if (tables.length === 0) return (
        <div className="empty-state">
            <div className="empty-state-icon" style={{ fontSize: '2rem', opacity: 0.3 }}>◫</div>
            <div className="empty-state-title">No tables found</div>
            <div className="empty-state-sub">No tabular data was detected in this document.</div>
        </div>
    )

    return (
        <div>
            <div className="label mb-4">
                {tables.length} table{tables.length !== 1 ? 's' : ''} extracted
            </div>
            {tables.map((t, i) => (
                <div key={t.id || i} className="table-html-wrapper" id={`table-${i}`}>
                    <div className="label mb-2" style={{ color: 'var(--text-muted)' }}>
                        Table {i + 1} — Page {t.page_num}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: t.html }} />
                </div>
            ))}
        </div>
    )
}
