import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSections, getTables, getImages, getLinks, getFullJson,
         downloadImage, downloadSection, downloadLinksCSV, downloadTableExport, getDocumentFileUrl } from '../api'
import DownloadButton from '../components/DownloadButton'

const TABS = ['Sections', 'Tables', 'Images', 'Links', 'Raw JSON']
const BASE = import.meta.env.VITE_API_URL || ''

function isDisplayableSection(sec) {
    const heading = (sec?.heading || '').trim()
    const content = (sec?.content || '').trim()

    if (!heading && !content) return false

    // Drop page markers / noise-like section stubs that hurt readability.
    if (/^(?:s\s*[-–]\s*\d+|page\s*\d+|\d+|\(?\d+\)?)$/i.test(heading) && content.length < 60) {
        return false
    }

    // Drop obvious table header fragments with little/no body.
    if (/^(?:No\.|No\s|[A-Z][a-z]?\s){6,}/.test(heading) && content.length < 120) {
        return false
    }

    // Keep table / figure anchors even if body is empty.
    if (/^(table|figure|fig\.)\s/i.test(heading)) return true

    return true
}

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

    const displaySections = sections
        .map((sec, idx) => ({ ...sec, _sourceIndex: idx }))
        .filter(isDisplayableSection)

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
                    {docId && (
                        <button
                            className="btn btn-ghost"
                            onClick={() => window.open(getDocumentFileUrl(docId), '_blank')}
                            style={{ marginTop: 8, width: '100%' }}
                            title="Open original PDF in new tab"
                        >
                            📄 Open Original PDF
                        </button>
                    )}
                </div>

                <div className="section-tree">
                    {displaySections.length === 0 ? (
                        <div className="text-muted text-xs" style={{ padding: '20px 12px' }}>
                            No sections detected.
                        </div>
                    ) : displaySections.map((sec, idx) => {
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
                            sections={displaySections}
                            activeSec={activeSec}
                            setActiveSec={setActiveSec}
                            sectionRefs={sectionRefs}
                            docId={docId}
                        />
                    )}
                    {activeTab === 'Tables' && <TablesTab tables={tables} docId={docId} />}
                    {activeTab === 'Images' && <ImagesTab images={images} docId={docId} />}
                    {activeTab === 'Links' && <LinksTab links={links} docId={docId} />}
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
function SectionsTab({ sections, activeSec, setActiveSec, sectionRefs, docId }) {
    const [copiedIdx, setCopiedIdx] = useState(null)

    const copyText = useCallback(async (sec, idx) => {
        const text = `${sec.heading || ''}\n\n${sec.content || ''}`
        try {
            await navigator.clipboard.writeText(text)
            setCopiedIdx(idx)
            setTimeout(() => setCopiedIdx(null), 1500)
        } catch { /* clipboard unavailable */ }
    }, [])

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
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div className="section-heading">{sec.heading || `Section ${idx + 1}`}</div>
                        <div className="section-actions">
                            <button
                                className="download-btn"
                                onClick={() => copyText(sec, idx)}
                                title="Copy section text"
                            >
                                {copiedIdx === idx ? '✓ Copied' : '⎘ Copy Text'}
                            </button>
                            <DownloadButton
                                label="Download .txt"
                                onClick={() => downloadSection(
                                    docId,
                                    sec._sourceIndex ?? idx,
                                    `${(sec.heading || `Section_${idx + 1}`).slice(0, 40)}.txt`
                                )}
                            />
                        </div>
                    </div>
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

/* ── Tables Tab — Full Visualizer with split panel + export ──────────────── */
function TablesTab({ tables, docId }) {
    const [selectedIdx, setSelectedIdx] = useState(0)

    if (tables.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">No tables found</div>
                <div className="empty-state-desc">No tables were detected in this document.</div>
            </div>
        )
    }

    const selected = tables[selectedIdx] || tables[0]
    const rowCount = selected.row_count ?? selected.rows?.length ?? 0
    const colCount = selected.col_count ?? selected.headers?.length ?? 0

    return (
        <div className="tv-shell">
            {/* Left panel: table list */}
            <div className="tv-list">
                {tables.map((tbl, idx) => {
                    const rc = tbl.row_count ?? tbl.rows?.length ?? 0
                    const cc = tbl.col_count ?? tbl.headers?.length ?? 0
                    return (
                        <button
                            key={idx}
                            className={`tv-list-item${selectedIdx === idx ? ' active' : ''}`}
                            onClick={() => setSelectedIdx(idx)}
                        >
                            <div className="tv-list-item-title">
                                Table {idx + 1} — Page {tbl.page} — {rc}×{cc}
                            </div>
                            {tbl.caption && (
                                <div className="tv-list-item-caption">{tbl.caption}</div>
                            )}
                            {tbl.extraction_method && (
                                <div className="tv-list-item-meta">via {tbl.extraction_method}</div>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Right panel: selected table rendering */}
            <div className="tv-detail">
                {/* Header with caption + export buttons */}
                <div className="tv-export-bar">
                    <div>
                        <div className="tv-export-bar-title">
                            Table {selectedIdx + 1}
                            <span className="table-viz-detail-dims">{rowCount}×{colCount}</span>
                        </div>
                        {selected.caption && (
                            <div className="tv-caption">{selected.caption}</div>
                        )}
                    </div>
                    <div className="tv-export-actions">
                        <DownloadButton label="CSV" onClick={() => downloadTableExport(docId, selectedIdx, 'csv')} />
                        <DownloadButton label="JSON" onClick={() => downloadTableExport(docId, selectedIdx, 'json')} />
                        <DownloadButton label="XLSX" onClick={() => downloadTableExport(docId, selectedIdx, 'xlsx')} />
                    </div>
                </div>

                {/* Table rendering */}
                <div className="tv-table-scroll">
                    <table className="data-table data-table-viz">
                        {selected.headers && selected.headers.length > 0 && (
                            <thead>
                                <tr>
                                    {selected.headers.map((h, hi) => (
                                        <th key={hi}>{h || '—'}</th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {(selected.rows || []).map((row, ri) => (
                                <tr key={ri} className={ri % 2 === 1 ? 'alt-row' : ''}>
                                    {row.map((cell, ci) => (
                                        <td key={ci}>{cell || ''}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="table-page-badge">
                    Page {selected.page}{selected.page_end && selected.page_end !== selected.page ? `–${selected.page_end}` : ''}
                    {selected.extraction_method && ` · ${selected.extraction_method}`}
                </div>
            </div>
        </div>
    )
}

/* ── Images Tab ──────────────────────────────────────────────────────────── */
function ImagesTab({ images, docId }) {
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
                    <div className="image-card-actions">
                        <DownloadButton
                            label="Download Image"
                            onClick={() => downloadImage(docId, img.image_index, `page${img.page}_img${img.image_index}.png`)}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── Links Tab ───────────────────────────────────────────────────────────── */
function LinksTab({ links, docId }) {
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
            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <DownloadButton
                    label="Export All Links as CSV"
                    onClick={() => downloadLinksCSV(docId)}
                />
            </div>
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
