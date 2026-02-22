import { useState, useEffect, useCallback } from 'react'
import { getPages } from '../api'

/**
 * PagesBrowser — paginated page text viewer for a document.
 */
export default function PagesBrowser({ docId }) {
    const [currentPage, setCurrentPage] = useState(1)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const fetchPage = useCallback(async (pageNum) => {
        setLoading(true)
        setError('')
        try {
            const result = await getPages(docId, pageNum)
            setData(result)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [docId])

    useEffect(() => {
        fetchPage(currentPage)
    }, [fetchPage, currentPage])

    const goTo = (n) => {
        if (n < 1 || (data && n > data.total_pages)) return
        setCurrentPage(n)
    }

    if (error) return (
        <div className="empty-state">
            <div className="empty-state-icon">⚠</div>
            <div className="empty-state-title text-error">{error}</div>
        </div>
    )

    return (
        <div>
            {/* Page header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <span className="label">Page Text</span>
                    {data && (
                        <span className="text-xs text-muted" style={{ marginLeft: 12 }}>
                            {data.total_pages} page{data.total_pages !== 1 ? 's' : ''} total
                        </span>
                    )}
                </div>
                {data && (
                    <div className="pagination">
                        <button
                            className="btn btn-secondary"
                            onClick={() => goTo(currentPage - 1)}
                            disabled={currentPage <= 1 || loading}
                            id="page-prev-btn"
                        >
                            ← Prev
                        </button>
                        <span className="page-indicator">
                            {currentPage} / {data.total_pages}
                        </span>
                        <button
                            className="btn btn-secondary"
                            onClick={() => goTo(currentPage + 1)}
                            disabled={currentPage >= data.total_pages || loading}
                            id="page-next-btn"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>

            {/* Page text */}
            {loading ? (
                <div className="page-text-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="spinner" />
                    <span className="text-muted text-sm">Loading page {currentPage}…</span>
                </div>
            ) : data ? (
                <div className="page-text-box">{data.text || '(Empty page)'}</div>
            ) : null}
        </div>
    )
}
