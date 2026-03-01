import { NavLink, useLocation } from 'react-router-dom'

const NAV = [
    { to: '/', icon: '⬆', label: 'Ingest' },
    { to: '/library', icon: '☰', label: 'Library' },
    { to: '/chat', icon: '◈', label: 'Chat' },
]

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-title">Maxcavator</div>
                <div className="sidebar-logo-sub">PDF Intelligence v2.0</div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section-label">Navigation</div>
                {NAV.map(({ to, icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                        id={`nav-${label.toLowerCase()}`}
                    >
                        <span className="nav-icon">{icon}</span>
                        {label}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                MongoDB · ChromaDB · Gemini 2.0
            </div>
        </aside>
    )
}
