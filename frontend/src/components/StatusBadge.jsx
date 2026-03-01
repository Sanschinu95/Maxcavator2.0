export default function StatusBadge({ status, label }) {
    const cls = (status || '').toLowerCase()
    const dot = cls === 'running'
    return (
        <span className={`badge ${cls}`}>
            <span className="badge-dot" />
            {label || status}
        </span>
    )
}
