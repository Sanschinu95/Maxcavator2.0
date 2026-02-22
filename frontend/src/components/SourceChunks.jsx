import { useState } from 'react'

/**
 * SourceChunks — collapsible citation panel for RAG source chunks.
 * Props: chunks = [{ text, page_num, chunk_index, distance }]
 */
export default function SourceChunks({ chunks }) {
    if (!chunks || chunks.length === 0) {
        return (
            <div className="sources-empty">
                <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>◦</span>
                <div>Source chunks will appear here after you send a message.</div>
            </div>
        )
    }

    return (
        <div>
            {chunks.map((chunk, i) => (
                <ChunkItem key={i} chunk={chunk} index={i} />
            ))}
        </div>
    )
}

function ChunkItem({ chunk, index }) {
    const [open, setOpen] = useState(index === 0)

    const relevance = chunk.distance != null
        ? `${((1 - chunk.distance) * 100).toFixed(0)}% match`
        : null

    return (
        <div className="source-chunk">
            <div
                className={`source-chunk-header${open ? ' open' : ''}`}
                onClick={() => setOpen(o => !o)}
                role="button"
                tabIndex={0}
                id={`source-chunk-${index}`}
                onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
                aria-expanded={open}
            >
                <span className="source-chunk-label">
                    {open ? '▾' : '▸'} Context {index + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {relevance && (
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-surface)',
                            padding: '2px 6px',
                            borderRadius: '100px',
                        }}>
                            {relevance}
                        </span>
                    )}
                    <span className="source-chunk-page">pg {chunk.page_num}</span>
                </div>
            </div>
            {open && (
                <div className="source-chunk-body">
                    {chunk.text}
                </div>
            )}
        </div>
    )
}
