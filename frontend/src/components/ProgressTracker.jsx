import StatusBadge from './StatusBadge'

/**
 * ProgressTracker — renders two independent pipeline progress bars.
 * Props: job = { extract_status, rag_status, extract_error, rag_error }
 */
export default function ProgressTracker({ job }) {
    if (!job) return null

    return (
        <div className="pipeline-tracker">
            <PipelineRow
                id="pipeline-extract"
                icon="◧"
                label="Pipeline A — Extraction"
                sublabel="Pages · Tables · Metadata → SQLite"
                status={job.extract_status}
                error={job.extract_error}
            />
            <PipelineRow
                id="pipeline-rag"
                icon="◨"
                label="Pipeline B — RAG Indexing"
                sublabel="Chunks · Embeddings → ChromaDB"
                status={job.rag_status}
                error={job.rag_error}
            />
        </div>
    )
}

function PipelineRow({ id, icon, label, sublabel, status, error }) {
    const s = status || 'pending'

    return (
        <div className="pipeline-row" id={id}>
            <div className="pipeline-row-header">
                <div className="pipeline-label">
                    <span className="pipeline-icon">{icon}</span>
                    {label}
                </div>
                <StatusBadge status={s} />
            </div>

            <div className="progress-bar-track">
                <div className={`progress-bar-fill ${s}`} />
            </div>

            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {sublabel}
                </span>
                {s === 'done' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-success)' }}>Completed</span>
                )}
            </div>

            {error && s === 'error' && (
                <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-error)',
                }}>
                    ✕ {error}
                </div>
            )}
        </div>
    )
}
