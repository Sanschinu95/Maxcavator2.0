import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory
_BASE_DIR = Path(__file__).parent
load_dotenv(_BASE_DIR / ".env")

# --------------------------------------------------------------------------- #
# API Keys
# --------------------------------------------------------------------------- #
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Add it to backend/.env as GROQ_API_KEY=your_key"
    )

# --------------------------------------------------------------------------- #
# MongoDB
# --------------------------------------------------------------------------- #
MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB: str  = os.getenv("MONGODB_DB", "maxcavator")

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
DATA_DIR: Path   = _BASE_DIR / "data"
CHROMA_DIR: Path = DATA_DIR / "chroma"
IMAGES_DIR: Path = _BASE_DIR / "images"
PDFS_DIR: Path   = _BASE_DIR / "pdfs"

# Create all directories on first import
for _d in (DATA_DIR, CHROMA_DIR, IMAGES_DIR, PDFS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- #
# Model / retrieval constants
# --------------------------------------------------------------------------- #
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
TOP_K_CHUNKS: int    = 6

# Groq model — llama-3.3-70b is the best available on Groq free tier
GROQ_MODEL: str  = "llama-3.3-70b-versatile"

CHUNK_SIZE: int    = 600
CHUNK_OVERLAP: int = 100
