import os
import sys
import webbrowser
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print("=" * 70)
    print("   ORESENTINEL AI - BOULDER DETECTION TO CRUSHER DOWNTIME INTELLIGENCE")
    print("   Tata Steel / Women of Mettle 2026")
    print("=" * 70)
    print(f"\nStarting unified full-stack server on http://localhost:{port} ...")
    print("Serving FastAPI backend & React frontend simultaneously...")
    print("Press Ctrl+C to stop.\n")
    
    # Run uvicorn server on all interfaces (0.0.0.0) for both local browser and cloud
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
