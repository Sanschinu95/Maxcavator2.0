# Maxcavator 2.0 🚀

**PDF Intelligence Platform** — Upload PDFs, explore structured data, and chat with your documents using AI.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + React Router |
| Backend | FastAPI + Uvicorn |
| Vector Store | ChromaDB + sentence-transformers |
| Database | SQLite (aiosqlite) |
| LLM | Groq (llama-3.3-70b-versatile) |
| PDF Parsing | PyMuPDF |

## Local Development

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env         # then fill in your API keys
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:8000`.

## Deployment

### Backend → Railway
1. Create a new Railway project, connect this GitHub repo
2. Set **Root Directory** to `backend`
3. Add a **Volume** mounted at `/app/data` for persistent SQLite + ChromaDB storage
4. Set environment variables: `GROQ_API_KEY`, `GEMINI_API_KEY`
5. Railway auto-detects Python via `requirements.txt` and starts via `Procfile`

### Frontend → Vercel
1. Create a new Vercel project, connect this GitHub repo
2. Set **Root Directory** to `frontend`
3. Set environment variable: `VITE_API_URL` = your Railway backend URL
4. Vercel auto-detects Vite and deploys

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key (required) |
| `GEMINI_API_KEY` | Gemini API key (optional) |

### Frontend (`frontend/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (empty = use Vite proxy in dev) |
