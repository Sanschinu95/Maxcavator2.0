/**
 * StatusBadge — displays pending / running / done / error with icon
 */
export default function StatusBadge({ status }) {
    const config = {
        pending: { label: 'Pending', icon: '◌' },
        running: { label: 'Running', icon: '◎' },
        done: { label: 'Done', icon: '◉' },
        error: { label: 'Error', icon: '✕' },
    }

    const s = status?.toLowerCase() || 'pending'
    const { label, icon } = config[s] || config.pending

    return (
        <span className={`badge badge-${s}`} aria-label={`Status: ${label}`}>
            {s === 'running' ? <span className="dot-running" /> : icon}
            {label}
        </span>
    )
}
