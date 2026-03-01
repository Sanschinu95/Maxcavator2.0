import { NavLink, Link } from 'react-router-dom'

export default function Navbar() {
    return (
        <nav className="navbar">
            <Link to="/" className="navbar-logo">
                <span className="navbar-logo-mark">◈</span>
                <span className="navbar-logo-title">Maxcavator</span>
            </Link>

            <div className="navbar-nav">
                <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    Ingest
                </NavLink>
                <NavLink to="/library" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    Library
                </NavLink>
                <NavLink to="/chat" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    Chat
                </NavLink>
            </div>

            <div className="navbar-actions">
                <button className="btn btn-amber" onClick={() => window.location.href = '/'}>
                    Try For Free
                </button>
            </div>
        </nav>
    )
}
