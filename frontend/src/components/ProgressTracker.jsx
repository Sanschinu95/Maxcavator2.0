/**
 * ProgressTracker — three progress bars: Extraction, RAG Indexing, Overall
 */
export default function ProgressTracker({ job }) {
    if (!job) return null

    const extractPct = job.extract_progress ?? (
        job.extract_status === 'done' ? 100 :
            job.extract_status === 'running' ? 50 :
                job.extract_status === 'error' ? 0 : 0
    )

    const ragPct = job.rag_progress ?? (
        job.rag_status === 'done' ? 100 :
            job.rag_status === 'running' ? 50 :
                job.rag_status === 'error' ? 0 : 0
    )

    const overallPct = Math.round((extractPct + ragPct) / 2)

    const statusClass = (status) => {
        if (status === 'done') return 'done'
        if (status === 'running') return 'running'
        if (status === 'error') return 'error'
        return 'pending'
    }

    return (
        <div className="progress-panel">
            <div className="progress-panel-title">
                <span>Pipeline Progress</span>
                {overallPct === 100
                    ? <span className="badge done"><span className="badge-dot" />Complete</span>
                    : <span className="badge running"><span className="badge-dot" />Processing</span>
                }
            </div>

            <div className="progress-group">
                <Bar label="Extraction" pct={extractPct} status={statusClass(job.extract_status)} />
                <Bar label="RAG Indexing" pct={ragPct} status={statusClass(job.rag_status)} />
                <Bar label="Overall" pct={overallPct} status={overallPct === 100 ? 'done' : overallPct > 0 ? 'running' : 'pending'} />
            </div>

            {job.errors && job.errors.length > 0 && (
                <div className="error-msg mt-3">
                    {job.errors.map((e, i) => (
                        <div key={i}>[{e.pipeline}] {e.error}</div>
                    ))}
                </div>
            )}
        </div>
    )
}

function Bar({ label, pct, status }) {
    return (
        <div className="progress-item">
            <div className="progress-label">
                <span className="progress-label-text">{label}</span>
                <span className="progress-label-pct">{pct}%</span>
            </div>
            <div className="progress-track">
                <div
                    className={`progress-fill ${status}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}
