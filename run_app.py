import os
import sys
import webbrowser
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import uvicorn

if __name__ == "__main__":
    print("=" * 70)
    print("   ORESENTINEL AI - BOULDER DETECTION TO CRUSHER DOWNTIME INTELLIGENCE")
    print("   Tata Steel / Women of Mettle 2026")
    print("=" * 70)
    print("\nStarting full-stack server on http://localhost:8000 ...")
    print("Serving FastAPI backend & React frontend...")
    print("Press Ctrl+C to stop.\n")
    
    # Run uvicorn server
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
