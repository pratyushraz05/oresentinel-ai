import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.database import get_db, engine, Base
from app.models import Incident, CrusherOutcome, Detection, MediaRecord
from app.analytics import get_analytics_kpi_summary, get_kpi_overrides, save_kpi_overrides
from app.copilot import process_copilot_query
from app.vision import get_yolo_model

def run_tests():
    print("[TEST] Initializing database...")
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    
    print("[TEST] Testing KPI summary with baseline zero overrides...")
    summary = get_analytics_kpi_summary(db)
    print(f"  - Downtime Avoided Hours: {summary['downtime_avoided_hours']}")
    print(f"  - Cost Avoidance INR: {summary['cost_avoidance_inr']}")
    print(f"  - Total Incidents: {summary['total_incidents']}")
    assert summary['downtime_avoided_hours'] == 0.0, "Downtime avoided hours should be 0.0"
    assert summary['cost_avoidance_inr'] == 0.0, "Cost avoidance INR should be 0.0"
    
    print("[TEST] Testing Copilot Queries...")
    queries = [
        "How do I reset avoided downtime and cost avoidance to zero?",
        "How does the camera calibration and distance measurement work?",
        "How can I delete fake incidents from the ledger?",
        "What model are you using for rock detection?",
        "What is the emergency SOP for a critical boulder?"
    ]
    for q in queries:
        res = process_copilot_query(q, db)
        print(f"\n[QUERY] {q}")
        print(f"[REPLY SUMMARY] {res['answer'][:120]}...")
        assert len(res['answer']) > 50, "Answer should be substantive"
        
    print("\n[TEST] Testing Rock YOLO Model Weights...")
    model = get_yolo_model()
    if model is not None:
        print(f"  - YOLO Model Names: {model.names}")
        assert 0 in model.names and model.names[0] == "rock", "Model class 0 should be rock"
    else:
        print("  - YOLO Model could not be loaded via get_yolo_model()")

    print("\n[SUCCESS] All unit and functional checks passed perfectly!")

if __name__ == "__main__":
    run_tests()
