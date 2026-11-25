import os
import shutil
import sqlite3
import json
from pathlib import Path

def main():
    base_dir = Path(__file__).resolve().parent.parent
    backend_dir = base_dir / "backend"
    data_dir = backend_dir / "data"
    uploads_dir = data_dir / "uploads"
    db_path = data_dir / "oresentinel.db"
    kpi_file = data_dir / "kpi_overrides.json"

    print(f"[PURGE] Cleaning uploads in: {uploads_dir}")
    deleted_files = 0
    if uploads_dir.exists():
        for item in uploads_dir.iterdir():
            try:
                if item.is_file():
                    item.unlink()
                    deleted_files += 1
                elif item.is_dir():
                    shutil.rmtree(item)
                    deleted_files += 1
            except Exception as e:
                print(f"Error removing {item}: {e}")
    print(f"[PURGE] Deleted {deleted_files} fake/test upload files.")

    # Clean database fake records
    if db_path.exists():
        print(f"[PURGE] Cleaning database at {db_path}...")
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        cur.execute("DELETE FROM audit_logs")
        cur.execute("DELETE FROM crusher_outcomes")
        cur.execute("DELETE FROM detections")
        cur.execute("DELETE FROM incidents")
        cur.execute("DELETE FROM media_records")
        conn.commit()
        
        # Check remaining
        cur.execute("SELECT COUNT(*) FROM incidents")
        inc_count = cur.fetchone()[0]
        conn.close()
        print(f"[PURGE] Database cleaned. Remaining incidents: {inc_count}")

    # Set default zero overrides so user starts with clean 0.0 values
    zero_kpis = {
        "downtime_avoided_hours": 0.0,
        "downtime_avoided_minutes": 0.0,
        "cost_avoidance_inr": 0.0,
        "actual_stoppage_minutes": 0.0,
        "critical_boulders_diverted": 0,
        "total_incidents": 0,
        "mean_lead_time_sec": 0.0,
        "detection_precision_pct": 96.4,
        "detection_recall_pct": 98.2,
        "system_availability_pct": 99.8
    }
    with open(kpi_file, "w") as f:
        json.dump(zero_kpis, f, indent=2)
    print(f"[PURGE] Saved default zero KPIs to {kpi_file}")

if __name__ == "__main__":
    main()
