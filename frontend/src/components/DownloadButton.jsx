import { useState, useCallback } from 'react'

/**
 * Reusable download button with consistent UX:
 *  - Outlined style with ↓ arrow icon
 *  - Shows "Saving..." state during fetch
 *  - Uses fetch → blob → URL.createObjectURL → programmatic <a> click
 *
 * Props:
 *  - onClick: async function that performs the download (should use downloadBlob pattern)
 *  - label: button text (default: "Download")
 *  - className: optional extra class
 *  - style: optional inline styles
 *  - title: optional tooltip
 */
export default function DownloadButton({ onClick, label = 'Download', className = '', style, title }) {
    const [saving, setSaving] = useState(false)

    const handleClick = useCallback(async (e) => {
        e.stopPropagation()
        if (saving) return
        setSaving(true)
        try {
            await onClick()
        } catch (err) {
            console.error('Download failed:', err)
        } finally {
            setSaving(false)
        }
    }, [onClick, saving])

    return (
        <button
            className={`download-btn ${className}`}
            onClick={handleClick}
            disabled={saving}
            style={style}
            title={title || label}
        >
            {saving ? (
                <>
                    <span className="spinner" style={{ width: 12, height: 12 }} />
                    {' '}Saving…
                </>
            ) : (
                <>↓ {label}</>
            )}
        </button>
    )
}
