import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSections, getTables, getImages, getLinks, getFullJson } from '../api'

const TABS = ['Sections', 'Tables', 'Images', 'Links', 'Raw JSON']
const BASE = import.meta.env.VITE_API_URL || ''

export default function ExplorePage() {
    const { docId } = useParams()
    const [activeTab, setActiveTab] = useState('Sections')
    const [sections, setSections] = useState([])
    const [tables, setTables] = useState([])
    const [images, setImages] = useState([])
    const [links, setLinks] = useState([])
    const [jsonData, setJsonData] = useState(null)
    const [docTitle, setDocTitle] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeSec, setActiveSec] = useState(0)
    const sectionRefs = useRef({})

    // ── Load all data on mount ────────────────────────────────────────────
    useEffect(() => {
        if (!docId) return
        setLoading(true)
        Promise.all([
            getSections(docId),
            getTables(docId),
            getImages(docId),
            getLinks(docId),
            getFullJson(docId),
        ])
            .then(([sec, tbl, img, lnk, json]) => {
                setSections(sec.sections || [])
                setDocTitle(sec.title || '')
                setTables(tbl.tables || [])
                setImages(img.images || [])
                setLinks(lnk.links || [])
                setJsonData(json)
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false))
    }, [docId])

    const scrollToSection = (idx) => {
        setActiveSec(idx)
        setActiveTab('Sections')
        setTimeout(() => {
            sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
    }

    if (loading) {
        return (
            <div className="explore-shell">
                <div className="explore-nav">
                    <div className="explore-nav-header">
                        <div className="skeleton" style={{ height: 16, width: '80%', marginTop: 10 }} />
                    </div>
                    <div className="section-tree" style={{ padding: 20 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="skeleton" style={{ height: 30, marginBottom: 8, borderRadius: 6 }} />
                        ))}
                    </div>
                </div>
                <div className="explore-main">
                    <div className="explore-body" style={{ paddingTop: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <span className="spinner" />
                        <div style={{ marginTop: 12 }}>Loading document structure…</div>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="error-msg">Failed to load document: {error}</div>
            </div>
        )
    }

    return (
        <div className="explore-shell">
            {/* ── Left panel: section tree ─────────────────────────────── */}
            <aside className="explore-nav">
                <div className="explore-nav-header">
                    <Link to="/library" className="explore-nav-header-back">← Library</Link>
                    <div className="explore-nav-header-title">{docTitle || 'Document'}</div>
                </div>

                <div className="section-tree">
                    {sections.length === 0 ? (
                        <div className="text-muted text-xs" style={{ padding: '20px 12px' }}>
                            No sections detected.
                        </div>
                    ) : sections.map((sec, idx) => {
                        const indent = Math.max(0, (sec.level || 1) - 1)
                        return (
                            <button
                                key={idx}
                                className={`section-tree-item${activeSec === idx ? ' active' : ''}`}
                                style={{ '--level': indent }}
                                onClick={() => scrollToSection(idx)}
                                id={`section-nav-${idx}`}
                            >
                                <span className="level-indent" />
                                <span className="section-label">{sec.heading || `Section ${idx + 1}`}</span>
                                <span className="section-pages">
                                    p{sec.page_start}{sec.page_end !== sec.page_start ? `–${sec.page_end}` : ''}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </aside>

            {/* ── Right area ───────────────────────────────────────────── */}
            <div className="explore-main">
                {/* Tab bar */}
                <div className="explore-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            className={`tab-btn${activeTab === tab ? ' active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                            id={`tab-${tab.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                            {tab}
                            {tab === 'Tables' && tables.length > 0 && <TabCount n={tables.length} />}
                            {tab === 'Images' && images.length > 0 && <TabCount n={images.length} />}
                            {tab === 'Links' && links.length > 0 && <TabCount n={links.length} />}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="explore-body">
                    {activeTab === 'Sections' && (
                        <SectionsTab
                            sections={sections}
                            activeSec={activeSec}
                            setActiveSec={setActiveSec}
                            sectionRefs={sectionRefs}
                        />
                    )}
                    {activeTab === 'Tables' && <TablesTab tables={tables} />}
                    {activeTab === 'Images' && <ImagesTab images={images} />}
                    {activeTab === 'Links' && <LinksTab links={links} />}
                    {activeTab === 'Raw JSON' && <JsonTab data={jsonData} />}
                </div>
            </div>
        </div>
    )
}

/* ── Tab count pill ─────────────────────────────────────────────────────── */
function TabCount({ n }) {
    return (
        <span style={{
            marginLeft: 6,
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 99,
            fontFamily: 'var(--font-mono)',
        }}>{n}</span>
    )
}

/* ── Sections Tab ────────────────────────────────────────────────────────── */
function SectionsTab({ sections, activeSec, setActiveSec, sectionRefs }) {
    if (sections.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <div className="empty-state-title">No sections detected</div>
                <div className="empty-state-desc">
                    The document may not have identifiable headings or the extraction is still running.
                </div>
            </div>
        )
    }

    return (
        <div className="section-reader">
            {sections.map((sec, idx) => (
                <div
                    key={idx}
                    ref={el => (sectionRefs.current[idx] = el)}
                    style={{ marginBottom: 48 }}
                    id={`section-content-${idx}`}
                >
                    <div className="section-heading">{sec.heading || `Section ${idx + 1}`}</div>
                    <div className="section-page-range">
                        Pages {sec.page_start}
                        {sec.page_end !== sec.page_start ? `—${sec.page_end}` : ''} · Level {sec.level || 1}
                    </div>
                    <div className="section-content">
                        {sec.content || <em style={{ color: 'var(--text-muted)' }}>No content.</em>}
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── Tables Tab ──────────────────────────────────────────────────────────── */
function TablesTab({ tables }) {
    if (tables.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">No tables found</div>
                <div className="empty-state-desc">PyMuPDF did not detect any tables in this document.</div>
            </div>
        )
    }

    return (
        <div className="tables-container">
            {tables.map((tbl, idx) => (
                <div key={idx} className="table-block" id={`table-block-${idx}`}>
                    {tbl.caption && (
                        <div className="table-caption">
                            {tbl.caption}
                            <span className="table-caption-pos">({tbl.caption_position})</span>
                        </div>
                    )}
                    <div className="table-scroll">
                        <table className="data-table">
                            {tbl.headers && tbl.headers.length > 0 && (
                                <thead>
                                    <tr>
                                        {tbl.headers.map((h, hi) => (
                                            <th key={hi}>{h || '—'}</th>
                                        ))}
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {(tbl.rows || []).map((row, ri) => (
                                    <tr key={ri}>
                                        {row.map((cell, ci) => (
                                            <td key={ci}>{cell || ''}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="table-page-badge">
                        Page {tbl.page}{tbl.page_end && tbl.page_end !== tbl.page ? `–${tbl.page_end}` : ''}
                        {tbl.rows?.length > 0 && ` · ${tbl.rows.length} rows`}
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── Images Tab ──────────────────────────────────────────────────────────── */
function ImagesTab({ images }) {
    const BASE = import.meta.env.VITE_API_URL || ''

    if (images.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🖼</div>
                <div className="empty-state-title">No images extracted</div>
                <div className="empty-state-desc">
                    No images (≥50×50 px) were found or Tesseract OCR may be unavailable.
                </div>
            </div>
        )
    }

    return (
        <div className="images-grid">
            {images.map((img, idx) => (
                <div key={idx} className="image-card" id={`image-card-${idx}`}>
                    <img
                        src={`${BASE}/${img.image_path}`}
                        alt={`Page ${img.page} image ${img.image_index}`}
                        loading="lazy"
                    />
                    {img.ocr_text && (
                        <div className="image-ocr-overlay">
                            <div className="image-ocr-overlay-title">OCR Text</div>
                            {img.ocr_text}
                        </div>
                    )}
                    <div className="image-card-meta">
                        <span>Page {img.page}</span>
                        <span>{img.width}×{img.height}</span>
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── Links Tab ───────────────────────────────────────────────────────────── */
function LinksTab({ links }) {
    if (links.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🔗</div>
                <div className="empty-state-title">No hyperlinks found</div>
                <div className="empty-state-desc">This document contains no URI hyperlinks.</div>
            </div>
        )
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="links-table" id="links-table">
                <thead>
                    <tr>
                        <th>Page</th>
                        <th>Anchor Text</th>
                        <th>URL</th>
                    </tr>
                </thead>
                <tbody>
                    {links.map((lnk, idx) => (
                        <tr key={idx}>
                            <td className="link-page">{lnk.page}</td>
                            <td style={{ maxWidth: 240, wordBreak: 'break-word' }}>{lnk.text}</td>
                            <td>
                                <a
                                    href={lnk.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="link-url"
                                    title={lnk.url}
                                >
                                    {lnk.url.length > 80 ? lnk.url.slice(0, 80) + '…' : lnk.url}
                                </a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/* ── JSON Tab ────────────────────────────────────────────────────────────── */
function JsonTab({ data }) {
    if (!data) {
        return <div className="text-muted text-sm">No data loaded.</div>
    }

    const json = JSON.stringify(data, null, 2)

    // Simple syntax highlighting
    const highlighted = json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
            let cls = 'json-number'
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'json-key' : 'json-string'
            } else if (/true|false/.test(match)) {
                cls = 'json-bool'
            } else if (/null/.test(match)) {
                cls = 'json-null'
            }
            return `<span class="${cls}">${match}</span>`
        }
    )

    return (
        <div
            className="json-viewer"
            id="json-viewer"
            dangerouslySetInnerHTML={{ __html: highlighted }}
        />
    )
}
