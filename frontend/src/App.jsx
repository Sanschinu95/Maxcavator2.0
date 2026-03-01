import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import IngestPage from './pages/IngestPage'
import LibraryPage from './pages/LibraryPage'
import ExplorePage from './pages/ExplorePage'
import ChatPage from './pages/ChatPage'

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-shell">
                <Navbar />
                <main className="main-content">
                    <div className="radial-glow-behind" />
                    <Routes>
                        <Route path="/" element={<IngestPage />} />
                        <Route path="/library" element={<LibraryPage />} />
                        <Route path="/explore/:docId" element={<ExplorePage />} />
                        <Route path="/chat/:docId" element={<ChatPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}
