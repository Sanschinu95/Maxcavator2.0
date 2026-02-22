import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import IngestPage from './pages/IngestPage'
import LibraryPage from './pages/LibraryPage'
import DataViewPage from './pages/DataViewPage'
import ChatPage from './pages/ChatPage'

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-shell">
                <Sidebar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<IngestPage />} />
                        <Route path="/library" element={<LibraryPage />} />
                        <Route path="/data/:docId" element={<DataViewPage />} />
                        <Route path="/chat/:docId" element={<ChatPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}
