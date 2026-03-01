# Maxcavator 2.0 ◈

**[ Understand ] Smarter** 

Maxcavator 2.0 is an intelligent, AI-native PDF Data Extraction and Retrieval-Augmented Generation (RAG) system. It fundamentally changes how you understand and interact with your PDF documents by instantly extracting complex structures (sections, tables, images), generating robust RAG indices, and allowing you to chat seamlessly with your documents.

![Maxcavator 2.0 Core Features](https://via.placeholder.com/800x400.png?text=Maxcavator+2.0+Hero+Interface)

## 🌟 Key Features

*   **Deep Document Extraction:** Powered by PyMuPDF and Tesseract OCR, it doesn't just read text; it understands the structure, capturing specific sections, tables, and extracting embedded map/image data.
*   **Intelligent RAG System:** Built with ChromaDB and Sentence Transformers, the contextual RAG pipeline dynamically fetches adjacent overlapping chunks to ensure continuous contextual understanding, resolving split-data limitations.
*   **Interactive PDF Viewer & Chat:** Chat directly with your documents. Click on any cited RAG source in the chat, and the integrated split-pane PDF viewer will instantly navigate to the exact page of the reference.
*   **Premium AI-Native UI:** A gorgeous, custom dark theme featuring deep black base layers, burnt orange accents, ambient radial glow effects, and a highly responsive React frontend.
*   **Multi-Ingestion Routing:** Upload raw `.pdf` files directly or provide a URL for automatic ingestion and structuring.

## 🛠️ Technology Stack

**Backend:**
*   **Framework:** FastAPI
*   **LLM Provider:** Groq API (Gemini 2.0 Flash)
*   **Vector Database:** ChromaDB
*   **Document Database:** MongoDB Atlas
*   **Embeddings:** `sentence-transformers`
*   **Extraction:** PyMuPDF (`fitz`), Tesseract OCR

**Frontend:**
*   **Framework:** React + Vite
*   **Routing:** React Router v6
*   **Styling:** Custom CSS architectural tokens (No heavy CSS frameworks)

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Python (3.9+)
*   MongoDB Atlas Account
*   Groq API Key

### 1. Backend Setup

Navigate to the backend directory:
```bash
cd backend
```

Create a virtual environment and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory with your keys:
```env
GROQ_API_KEY=your_groq_api_key_here
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=maxcavator_db
```

Start the FastAPI backend server:
```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

Navigate to the frontend directory:
```bash
cd frontend
```

Install the Node modules:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```

### 3. Access the Application
Open your browser and navigate to `http://localhost:5173` to access the Maxcavator 2.0 interface. The API runs on `http://localhost:8000`.

## 📁 Project Structure

```text
Maxcavator2.0/
├── backend/
│   ├── data/              # Internal DBs (Chroma vector store)
│   ├── images/            # Extracted document images
│   ├── pdfs/              # Saved raw PDFs for viewer access
│   ├── pipelines/         # Core AI pipelines (extract.py, rag.py, structurer.py)
│   ├── routers/           # FastAPI routing (chat, dataview, documents, ingest)
│   ├── config.py          # Environment configs
│   ├── database.py        # MongoDB connection management
│   ├── main.py            # FastAPI Entrypoint
│   └── vector_store.py    # ChromaDB logic
└── frontend/
    ├── src/
    │   ├── api/           # Backend HTTP requests multiplexing
    │   ├── components/    # Reusable UI (Navbar, ProgressTracker)
    │   ├── hooks/         # Custom React hooks (useChat, useJobStatus)
    │   ├── pages/         # Core views (IngestPage, ChatPage, ExplorePage)
    │   ├── App.jsx        # Routing layer
    │   └── index.css      # Core Design Tokens
    └── package.json
```

## 📜 License
This project is proprietary.
