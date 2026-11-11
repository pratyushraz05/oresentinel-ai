#!/usr/bin/env python3
"""
OreSentinel AI - Roboflow/Open-Source Dataset Downloader & Merger
Downloads rock/mining datasets, merges into unified YOLOv8 training set.
"""

import os
import json
import shutil
import yaml
import argparse
from pathlib import Path
from typing import List, Dict, Optional
import requests
from tqdm import tqdm


# Known open-source mining/rock datasets on Roboflow Universe
ROBOFLOW_DATASETS = {
    "rock-fragmentation": {
        "workspace": "roboflow-universe-projects",
        "project": "rock-fragmentation",
        "version": 1,
        "classes": ["rock", "boulder", "ore"],
        "license": "CC BY 4.0"
    },
    "crusher-rocks": {
        "workspace": "mining-ai",
        "project": "crusher-rocks",
        "version": 2,
        "classes": ["oversize_boulder", "normal_rock", "wedge_rock"],
        "license": "CC BY 4.0"
    },
    "mining-ore-detection": {
        "workspace": "industrial-vision",
        "project": "mining-ore-detection",
        "version": 1,
        "classes": ["ore_piece", "waste_rock", "conveyor_belt"],
        "license": "CC BY 4.0"
    },
    "quarry-rock-detection": {
        "workspace": "quarry-monitoring",
        "project": "quarry-rock-detection",
        "version": 1,
        "classes": ["rock", "boulder", "screen_mesh"],
        "license": "CC BY 4.0"
    },
    "aggregate-classification": {
        "workspace": "construction-materials",
        "project": "aggregate-classification",
        "version": 1,
        "classes": ["coarse_aggregate", "fine_aggregate", "oversize"],
        "license": "CC BY 4.0"
    }
}

# OreSentinel target classes (what we train for)
TARGET_CLASSES = [
    "rock_fragment",      # 0 - Normal ore (< 650mm)
    "oversize_boulder",   # 1 - ≥ 800mm, crusher hazard
    "wedging_slab",       # 2 - High aspect ratio, bridging risk
    "conveyor_belt",      # 3 - Background (reduces false positives)
    "personnel",          # 4 - Safety
    "debris"              # 5 - Non-ore objects
]

# Mapping from source dataset classes → target classes
CLASS_MAPPING = {
    # Roboflow rock-fragmentation
    "rock": "rock_fragment",
    "boulder": "oversize_boulder",
    "ore": "rock_fragment",
    # crusher-rocks
    "oversize_boulder": "oversize_boulder",
    "normal_rock": "rock_fragment",
    "wedge_rock": "wedging_slab",
    # mining-ore-detection
    "ore_piece": "rock_fragment",
    "waste_rock": "rock_fragment",
    "conveyor_belt": "conveyor_belt",
    # quarry-rock-detection
    "rock": "rock_fragment",
    "boulder": "oversize_boulder",
    "screen_mesh": "debris",
    # aggregate-classification
    "coarse_aggregate": "rock_fragment",
    "fine_aggregate": "rock_fragment",
    "oversize": "oversize_boulder",
}


def download_roboflow_dataset(api_key: str, dataset_key: str, output_dir: Path) -> bool:
    """
    Download dataset from Roboflow using API.
    Requires: pip install roboflow
    """
    try:
        from roboflow import Roboflow
    except ImportError:
        print("❌ roboflow package not installed: pip install roboflow")
        return False

    ds_info = ROBOFLOW_DATASETS.get(dataset_key)
    if not ds_info:
        print(f"❌ Unknown dataset: {dataset_key}")
        return False

    try:
        rf = Roboflow(api_key=api_key)
        project = rf.workspace(ds_info["workspace"]).project(ds_info["project"])
        version = project.version(ds_info["version"])
        dataset = version.download("yolov8", location=str(output_dir / dataset_key))
        print(f"✅ Downloaded {dataset_key} to {dataset.location}")
        return True
    except Exception as e:
        print(f"❌ Failed to download {dataset_key}: {e}")
        return False


def merge_yolo_datasets(
    source_dirs: List[Path],
    output_dir: Path,
    split_ratios: Dict[str, float] = None
):
    """
    Merge multiple YOLO-format datasets into one unified dataset.
    Remaps classes to TARGET_CLASSES.
    """
    if split_ratios is None:
        split_ratios = {"train": 0.8, "val": 0.15, "test": 0.05}

    # Create output structure
    for split in ["train", "val", "test"]:
        (output_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Collect all images with their labels and original class mapping
    all_samples = []  # (img_path, label_path, source_dataset)

    for src_dir in source_dirs:
        if not src_dir.exists():
            print(f"⚠️  Source not found: {src_dir}")
            continue

        dataset_name = src_dir.name
        print(f"📂 Processing {dataset_name}...")

        for split in ["train", "val", "test"]:
            img_dir = src_dir / "images" / split
            lbl_dir = src_dir / "labels" / split

            if not img_dir.exists():
                # Try alternative structure (some datasets put all in train/)
                img_dir = src_dir / split / "images"
                lbl_dir = src_dir / split / "labels"

            if not img_dir.exists():
                continue

            for img_path in img_dir.glob("*.jpg"):
                lbl_path = lbl_dir / (img_path.stem + ".txt")
                if lbl_path.exists():
                    all_samples.append((img_path, lbl_path, dataset_name))
                else:
                    # Image without label - could be background
                    all_samples.append((img_path, None, dataset_name))

    print(f"📊 Total samples collected: {len(all_samples)}")

    if not all_samples:
        print("❌ No valid samples found!")
        return

    # Shuffle and split
    import random
    random.seed(42)
    random.shuffle(all_samples)

    n_total = len(all_samples)
    n_train = int(n_total * split_ratios["train"])
    n_val = int(n_total * split_ratios["val"])

    splits = {
        "train": all_samples[:n_train],
        "val": all_samples[n_train:n_train + n_val],
        "test": all_samples[n_train + n_val:]
    }

    # Copy and remap labels
    class_counts = {c: 0 for c in TARGET_CLASSES}

    for split_name, samples in splits.items():
        print(f"  {split_name}: {len(samples)} samples")
        for idx, (img_path, lbl_path, src_name) in enumerate(tqdm(samples, desc=f"  {split_name}")):
            # New filename with dataset prefix to avoid collisions
            new_name = f"{src_name}_{img_path.stem}_{idx:06d}.jpg"
            new_img = output_dir / "images" / split_name / new_name
            new_lbl = output_dir / "labels" / split_name / (new_name.replace(".jpg", ".txt"))

            # Copy image
            shutil.copy2(img_path, new_img)

            # Process labels
            if lbl_path and lbl_path.exists():
                new_labels = []
                with open(lbl_path, 'r') as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 5:
                            src_class = parts[0]
                            # Try to map class name if label has names, else use index
                            if src_class.isdigit():
                                # Need class names from source dataset's data.yaml
                                src_yaml = src_dir / "data.yaml"
                                if src_yaml.exists():
                                    with open(src_yaml) as yf:
                                        src_data = yaml.safe_load(yf)
                                    src_names = src_data.get("names", {})
                                    if isinstance(src_names, dict):
                                        src_class_name = src_names.get(int(src_class), "")
                                    elif isinstance(src_names, list):
                                        src_class_name = src_names[int(src_class)] if int(src_class) < len(src_names) else ""
                                    else:
                                        src_class_name = ""
                                else:
                                    src_class_name = ""
                            else:
                                src_class_name = src_class

                            # Map to target class
                            target_class = CLASS_MAPPING.get(src_class_name, "rock_fragment")
                            target_idx = TARGET_CLASSES.index(target_class)
                            class_counts[target_class] += 1

                            # Rewrite with target class index
                            new_labels.append(f"{target_idx} {' '.join(parts[1:])}")

                with open(new_lbl, 'w') as f:
                    f.write("\n".join(new_labels))
            else:
                # No label file - create empty (background)
                new_lbl.touch()

    # Write data.yaml
    data_yaml = {
        "path": output_dir.as_posix(),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {i: name for i, name in enumerate(TARGET_CLASSES)}
    }

    with open(output_dir / "data.yaml", 'w') as f:
        yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

    print(f"\n✅ Merged dataset created at: {output_dir}")
    print("Class distribution:")
    for cls, count in class_counts.items():
        print(f"  {cls}: {count}")


def download_kaggle_dataset(dataset_slug: str, output_dir: Path) -> bool:
    """Download from Kaggle (requires kaggle CLI: pip install kaggle, kaggle.json in ~/.kaggle)."""
    try:
        import subprocess
        result = subprocess.run(
            ["kaggle", "datasets", "download", "-d", dataset_slug, "-p", str(output_dir), "--unzip"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"✅ Downloaded {dataset_slug}")
            return True
        else:
            print(f"❌ Kaggle download failed: {result.stderr}")
            return False
    except FileNotFoundError:
        print("❌ Kaggle CLI not installed. Install: pip install kaggle")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download & merge mining/rock datasets for OreSentinel")
    parser.add_argument("--roboflow-key", type=str, help="Roboflow API key")
    parser.add_argument("--datasets", nargs="+", default=list(ROBOFLOW_DATASETS.keys()),
                        choices=list(ROBOFLOW_DATASETS.keys()),
                        help="Datasets to download")
    parser.add_argument("--kaggle", nargs="+", help="Kaggle dataset slugs (e.g., 'user/rock-detection')")
    parser.add_argument("--local", nargs="+", type=Path, help="Local YOLO dataset directories to merge")
    parser.add_argument("--output", type=Path, default=Path("backend/ml/dataset"),
                        help="Output directory for merged dataset")
    parser.add_argument("--skip-download", action="store_true", help="Only merge local datasets")

    args = parser.parse_args()

    base_output = Path(args.output)
    base_output.mkdir(parents=True, exist_ok=True)

    source_dirs = []

    # Download from Roboflow
    if args.roboflow_key and not args.skip_download:
        print("📥 Downloading from Roboflow...")
        for ds in args.datasets:
            out_dir = base_output / "raw" / ds
            out_dir.mkdir(parents=True, exist_ok=True)
            if download_roboflow_dataset(args.roboflow_key, ds, base_output / "raw"):
                source_dirs.append(out_dir)

    # Download from Kaggle
    if args.kaggle and not args.skip_download:
        print("📥 Downloading from Kaggle...")
        for slug in args.kaggle:
            out_dir = base_output / "raw" / slug.replace("/", "_")
            out_dir.mkdir(parents=True, exist_ok=True)
            if download_kaggle_dataset(slug, out_dir):
                source_dirs.append(out_dir)

    # Add local datasets
    if args.local:
        print("📂 Adding local datasets...")
        for local in args.local:
            if local.exists():
                source_dirs.append(local)
            else:
                print(f"⚠️  Not found: {local}")

    if not source_dirs:
        print("❌ No source datasets specified. Use --roboflow-key, --kaggle, or --local")
        return

    # Merge all
    print(f"\n🔀 Merging {len(source_dirs)} datasets...")
    merge_yolo_datasets(source_dirs, base_output)

    print("\n🎯 Next steps:")
    print(f"  1. Review merged dataset in {base_output}")
    print(f"  2. Train: cd backend && python ml/train_yolo.py")
    print(f"  3. Or fine-tune: python ml/train_yolo.py --epochs 20 --lr 0.001")


if __name__ == "__main__":
    main()