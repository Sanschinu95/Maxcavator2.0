/**
 * api.js — All API calls to the Maxcavator 2.0 FastAPI backend.
 */

const BASE = import.meta.env.VITE_API_URL || ''

// ─────────────────────────────────── Ingest ──────────────────────────────── //
export async function ingestFile(file) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/ingest`, { method: 'POST', body: form })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Ingest failed')
    }
    return res.json()
}

export async function ingestUrl(url) {
    const form = new FormData()
    form.append('url', url)
    const res = await fetch(`${BASE}/ingest`, { method: 'POST', body: form })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Ingest failed')
    }
    return res.json()
}

// ────────────────────────────────── Status ───────────────────────────────── //
export async function getStatus(jobId) {
    const res = await fetch(`${BASE}/status/${jobId}`)
    if (!res.ok) throw new Error('Failed to fetch status')
    return res.json()
}

// ─────────────────────────────────── Docs ────────────────────────────────── //
export async function getDocuments() {
    const res = await fetch(`${BASE}/documents`)
    if (!res.ok) throw new Error('Failed to fetch documents')
    return res.json()   // { documents: [...] }
}

export async function deleteDocument(docId) {
    const res = await fetch(`${BASE}/documents/${docId}`, { method: 'DELETE' })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Delete failed')
    }
    return res.json()
}

// ──────────────────────────────── Explore ────────────────────────────────── //
export async function getSections(docId) {
    const res = await fetch(`${BASE}/explore/${docId}/sections`)
    if (!res.ok) throw new Error('Failed to fetch sections')
    return res.json()
}

export async function getTables(docId) {
    const res = await fetch(`${BASE}/explore/${docId}/tables`)
    if (!res.ok) throw new Error('Failed to fetch tables')
    return res.json()
}

export async function getImages(docId) {
    const res = await fetch(`${BASE}/explore/${docId}/images`)
    if (!res.ok) throw new Error('Failed to fetch images')
    return res.json()
}

export async function getLinks(docId) {
    const res = await fetch(`${BASE}/explore/${docId}/links`)
    if (!res.ok) throw new Error('Failed to fetch links')
    return res.json()
}

export async function getFullJson(docId) {
    const res = await fetch(`${BASE}/explore/${docId}/json`)
    if (!res.ok) throw new Error('Failed to fetch document JSON')
    return res.json()
}

// ──────────────────────────── Download helpers ───────────────────────────── //

/**
 * Generic blob download: fetches a URL, creates an object URL, triggers a
 * programmatic <a> click to save the file. Returns when the download starts.
 */
export async function downloadBlob(url, filename) {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
    }, 100)
}

export function downloadImage(docId, imageIndex, filename) {
    return downloadBlob(
        `${BASE}/explore/${docId}/images/${imageIndex}/download`,
        filename || `image_${imageIndex}.png`
    )
}

export function downloadSection(docId, sectionIndex, filename) {
    return downloadBlob(
        `${BASE}/explore/${docId}/sections/${sectionIndex}/download`,
        filename || `section_${sectionIndex + 1}.txt`
    )
}

export function downloadLinksCSV(docId) {
    return downloadBlob(
        `${BASE}/explore/${docId}/links/export`,
        `links_${docId.slice(0, 8)}.csv`
    )
}

export function downloadTableExport(docId, tableIndex, format) {
    const ext = format === 'xlsx' ? 'xlsx' : format === 'json' ? 'json' : 'csv'
    return downloadBlob(
        `${BASE}/explore/${docId}/tables/${tableIndex}/export?format=${format}`,
        `table_${tableIndex + 1}.${ext}`
    )
}

export function getDocumentFileUrl(docId) {
    return `${BASE}/documents/${docId}/file`
}

// ──────────────────────────────── Chat SSE ───────────────────────────────── //
/**
 * chatStream — opens an SSE POST stream manually.
 * Returns an AbortController so the caller can cancel.
 */
export function chatStream({ query, docId, history, onToken, onSources, onDone, onError }) {
    const controller = new AbortController()

    const body = JSON.stringify({
        query,
        doc_id: docId || null,
        history: history.map(m => ({ role: m.role, content: m.content })),
    })

    fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
    })
        .then(async (res) => {
            if (!res.ok) {
                const text = await res.text()
                onError?.(text || res.statusText)
                onDone?.()
                return
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()    // save incomplete line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    const raw = line.slice(6).trim()
                    if (!raw) continue
                    try {
                        const evt = JSON.parse(raw)
                        if (evt.type === 'token') onToken?.(evt.content)
                        else if (evt.type === 'sources') onSources?.(evt.content)
                        else if (evt.type === 'error') onError?.(evt.content)
                        else if (evt.type === 'done') onDone?.()
                    } catch {
                        // malformed event — skip
                    }
                }
            }
        })
        .catch((err) => {
            if (err.name !== 'AbortError') {
                onError?.(err.message || 'Stream connection failed')
                onDone?.()
            }
        })

    return controller
}
