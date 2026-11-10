from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
FIXTURES_DIR = DATA_DIR / "fixtures"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'oresentinel.db'}"

class PlantConfig(BaseModel):
    plant_name: str = "Tata Steel Raw Material Handling - Ore Crushing Unit #2"
    crusher_type: str = "Primary Gyratory & Jaw Crusher"
    throat_limit_mm: float = 800.0  # Max allowable boulder dimension
    warning_threshold_mm: float = 650.0
    conveyor_width_mm: float = 1400.0  # Known conveyor belt width for calibration
    hourly_downtime_cost: float = 150000.0  # In INR (approx $1,800 USD)
    lead_time_target_sec: float = 180.0  # 3 minutes target lead time before boulder reaches crusher
    active_cameras: list[dict] = [
        {"id": "CAM-01-CHUTE", "name": "Primary Feed Chute Camera", "location": "Conveyor Belt 1A", "resolution": "1920x1080"},
        {"id": "CAM-02-JAW", "name": "Jaw Crusher Throat Camera", "location": "Inlet Hopper 2B", "resolution": "1920x1080"},
        {"id": "CAM-03-TRANSFER", "name": "Transfer Chute Overband Camera", "location": "Belt 3 Transfer", "resolution": "1280x720"},
    ]

CONFIG = PlantConfig()
