#!/usr/bin/env python3
"""
OreSentinel AI - Training Data Capture Script
Automatically captures timestamped frames from camera feeds for labeling.

Usage:
    python capture_training_data.py --camera 0 --interval 5 --duration 3600
    python capture_training_data.py --config cameras.yaml
"""

import cv2
import argparse
import time
import os
import json
import yaml
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Optional
import threading
import signal
import sys


@dataclass
class CameraConfig:
    """Configuration for one camera source."""
    camera_id: str
    source: str  # Device index (0,1,2), RTSP URL, or video file
    name: str
    location: str
    resolution: str = "1920x1080"
    fps_target: int = 30
    enabled: bool = True


@dataclass
class CaptureConfig:
    """Global capture configuration."""
    cameras: List[CameraConfig]
    output_dir: str = "training_data"
    interval_seconds: float = 5.0
    duration_seconds: Optional[float] = None  # None = infinite
    max_frames_per_camera: Optional[int] = None
    save_metadata: bool = True
    organize_by_date: bool = True
    organize_by_camera: bool = True


class DataCapture:
    """Manages multi-camera frame capture for training data collection."""

    def __init__(self, config: CaptureConfig):
        self.config = config
        self.running = False
        self.caps = {}
        self.threads = {}
        self.frame_counts = {}
        self.start_time = None
        self.lock = threading.Lock()

        # Setup output directory
        self.base_output = Path(config.output_dir)
        self.base_output.mkdir(parents=True, exist_ok=True)

        # Metadata file
        self.metadata_path = self.base_output / "capture_metadata.jsonl"

        # Signal handling
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        print("\n[STOP] Shutdown signal received, stopping capture...")
        self.stop()

    def _get_camera_output_dir(self, camera: CameraConfig) -> Path:
        """Determine output directory for a camera."""
        parts = [self.base_output]
        if self.config.organize_by_date:
            parts.append(datetime.now().strftime("%Y-%m-%d"))
        if self.config.organize_by_camera:
            parts.append(camera.camera_id)
        out_dir = Path(*parts)
        out_dir.mkdir(parents=True, exist_ok=True)
        return out_dir

    def _open_camera(self, camera: CameraConfig) -> Optional[cv2.VideoCapture]:
        """Open camera source with retries."""
        source = camera.source
        # Try as integer (device index)
        try:
            source_int = int(source)
            cap = cv2.VideoCapture(source_int)
        except ValueError:
            # RTSP or file path
            cap = cv2.VideoCapture(source)

        if not cap.isOpened():
            print(f"❌ Failed to open {camera.camera_id} ({source})")
            return None

        # Set resolution if specified
        if camera.resolution:
            try:
                w, h = map(int, camera.resolution.split('x'))
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
            except:
                pass

        # Set FPS
        cap.set(cv2.CAP_PROP_FPS, camera.fps_target)

        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = cap.get(cv2.CAP_PROP_FPS)
        print(f"[OK] {camera.camera_id}: {actual_w}x{actual_h} @ {actual_fps:.1f}fps")

        return cap

    def _capture_loop(self, camera: CameraConfig):
        """Background thread: capture frames at interval."""
        cap = self.caps.get(camera.camera_id)
        if not cap:
            return

        out_dir = self._get_camera_output_dir(camera)
        interval = self.config.interval_seconds
        next_capture = time.time()
        frame_num = 0

        while self.running:
            # Check duration limit
            if self.config.duration_seconds and (time.time() - self.start_time) > self.config.duration_seconds:
                break

            # Check max frames limit
            if self.config.max_frames_per_camera and frame_num >= self.config.max_frames_per_camera:
                break

            # Grab frame (non-blocking)
            if not cap.grab():
                time.sleep(0.1)
                continue

            # Retrieve at capture interval
            now = time.time()
            if now < next_capture:
                time.sleep(0.01)
                continue

            next_capture = now + interval
            ret, frame = cap.retrieve()
            if not ret or frame is None:
                continue

            # Save frame
            timestamp = datetime.utcnow()
            filename = f"{camera.camera_id}_{timestamp.strftime('%Y%m%d_%H%M%S_%f')[:-3]}.jpg"
            filepath = out_dir / filename

            # High quality JPEG
            cv2.imwrite(str(filepath), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

            # Update counters
            with self.lock:
                self.frame_counts[camera.camera_id] = frame_num + 1
            frame_num += 1

            # Save metadata
            if self.config.save_metadata:
                meta = {
                    "camera_id": camera.camera_id,
                    "camera_name": camera.name,
                    "location": camera.location,
                    "filename": filename,
                    "relative_path": str(filepath.relative_to(self.base_output)),
                    "timestamp_utc": timestamp.isoformat(),
                    "resolution": f"{frame.shape[1]}x{frame.shape[0]}",
                    "interval_seconds": interval
                }
                with open(self.metadata_path, 'a') as f:
                    f.write(json.dumps(meta) + '\n')

            # Progress
            if frame_num % 10 == 0:
                elapsed = time.time() - self.start_time
                rate = frame_num / elapsed if elapsed > 0 else 0
                print(f"  [FRAME] {camera.camera_id}: {frame_num} frames ({rate:.1f} fps captured)")

        print(f"[DONE] {camera.camera_id} capture thread stopped ({frame_num} frames)")

    def start(self):
        """Start capture on all enabled cameras."""
        print("=" * 60)
        print("   ORESENTINEL AI - TRAINING DATA CAPTURE")
        print("=" * 60)
        print(f"Output directory: {self.base_output.absolute()}")
        print(f"Capture interval: {self.config.interval_seconds}s")
        if self.config.duration_seconds:
            print(f"Duration: {self.config.duration_seconds}s ({self.config.duration_seconds/3600:.1f}h)")
        if self.config.max_frames_per_camera:
            print(f"Max frames/camera: {self.config.max_frames_per_camera}")
        print()

        # Open cameras
        for camera in self.config.cameras:
            if not camera.enabled:
                print(f"[SKIP] Skipping disabled camera: {camera.camera_id}")
                continue
            cap = self._open_camera(camera)
            if cap:
                self.caps[camera.camera_id] = cap
                self.frame_counts[camera.camera_id] = 0

        if not self.caps:
            print("❌ No cameras opened. Exiting.")
            return

        self.running = True
        self.start_time = time.time()

        # Start capture threads
        for camera in self.config.cameras:
            if camera.camera_id in self.caps:
                t = threading.Thread(target=self._capture_loop, args=(camera,), daemon=True)
                t.start()
                self.threads[camera.camera_id] = t

        print(f"\n[START] Capture started on {len(self.caps)} camera(s)")
        print("   Press Ctrl+C to stop\n")

        # Main thread: monitor and report
        try:
            while self.running and any(t.is_alive() for t in self.threads.values()):
                time.sleep(5)
                self._print_status()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()

    def _print_status(self):
        """Print periodic status update."""
        elapsed = time.time() - self.start_time
        total = sum(self.frame_counts.values())
        print(f"\n[STATUS] @ {elapsed:.0f}s: {total} total frames")
        for cam_id, count in self.frame_counts.items():
            print(f"   {cam_id}: {count} frames")

    def stop(self):
        """Stop all capture threads."""
        self.running = False
        for t in self.threads.values():
            t.join(timeout=5)
        for cap in self.caps.values():
            cap.release()
        cv2.destroyAllWindows()

        elapsed = time.time() - self.start_time if self.start_time else 0
        total = sum(self.frame_counts.values())
        print(f"\n[COMPLETE] Capture complete: {total} frames in {elapsed:.0f}s")
        print(f"   Data saved to: {self.base_output.absolute()}")
        print(f"   Metadata: {self.metadata_path}")


def load_config(config_path: str) -> CaptureConfig:
    """Load capture configuration from YAML file."""
    with open(config_path, 'r') as f:
        data = yaml.safe_load(f)

    cameras = [CameraConfig(**c) for c in data.get('cameras', [])]
    return CaptureConfig(
        cameras=cameras,
        output_dir=data.get('output_dir', 'training_data'),
        interval_seconds=data.get('interval_seconds', 5.0),
        duration_seconds=data.get('duration_seconds'),
        max_frames_per_camera=data.get('max_frames_per_camera'),
        save_metadata=data.get('save_metadata', True),
        organize_by_date=data.get('organize_by_date', True),
        organize_by_camera=data.get('organize_by_camera', True)
    )


def create_default_config(output_path: str = "cameras.yaml"):
    """Create a sample camera configuration file."""
    config = {
        'cameras': [
            {
                'camera_id': 'CAM-01-CHUTE',
                'source': '0',  # Device index or RTSP URL
                'name': 'Primary Feed Chute Camera',
                'location': 'Conveyor Belt 1A',
                'resolution': '1920x1080',
                'fps_target': 30,
                'enabled': True
            },
            {
                'camera_id': 'CAM-02-JAW',
                'source': '1',
                'name': 'Jaw Crusher Throat Camera',
                'location': 'Inlet Hopper 2B',
                'resolution': '1920x1080',
                'fps_target': 30,
                'enabled': True
            },
            {
                'camera_id': 'CAM-03-TRANSFER',
                'source': 'rtsp://user:pass@192.168.1.100:554/stream1',
                'name': 'Transfer Chute Overband Camera',
                'location': 'Belt 3 Transfer',
                'resolution': '1280x720',
                'fps_target': 25,
                'enabled': False
            }
        ],
        'output_dir': 'training_data',
        'interval_seconds': 5.0,
        'duration_seconds': None,
        'max_frames_per_camera': None,
        'save_metadata': True,
        'organize_by_date': True,
        'organize_by_camera': True
    }
    with open(output_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    print(f"Created default config: {output_path}")
    print("   Edit it with your camera sources, then run:")
    print(f"   python capture_training_data.py --config {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="OreSentinel AI - Training Data Capture",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick test with laptop camera (device 0)
  python capture_training_data.py --camera 0 --interval 2 --duration 60

  # Production multi-camera from config file
  python capture_training_data.py --config cameras.yaml

  # Create default config file
  python capture_training_data.py --create-config
        """
    )

    # Quick single-camera mode
    parser.add_argument('--camera', type=str, help='Camera source (device index, RTSP, or file)')
    parser.add_argument('--camera-id', type=str, default='CAM-01', help='Camera ID')
    parser.add_argument('--camera-name', type=str, default='Test Camera', help='Camera name')
    parser.add_argument('--location', type=str, default='Test Location', help='Location description')
    parser.add_argument('--resolution', type=str, default='1920x1080', help='Resolution WxH')
    parser.add_argument('--interval', type=float, default=5.0, help='Capture interval (seconds)')
    parser.add_argument('--duration', type=float, help='Capture duration (seconds)')
    parser.add_argument('--max-frames', type=int, help='Max frames to capture')
    parser.add_argument('--output', type=str, default='training_data', help='Output directory')

    # Config file mode
    parser.add_argument('--config', type=str, help='YAML config file path')
    parser.add_argument('--create-config', action='store_true', help='Create default config file')

    args = parser.parse_args()

    if args.create_config:
        create_default_config()
        return

    if args.config:
        if not Path(args.config).exists():
            print(f"❌ Config file not found: {args.config}")
            print("   Run with --create-config to generate a template")
            return
        config = load_config(args.config)
    elif args.camera:
        # Quick single-camera mode
        camera = CameraConfig(
            camera_id=args.camera_id,
            source=args.camera,
            name=args.camera_name,
            location=args.location,
            resolution=args.resolution,
            enabled=True
        )
        config = CaptureConfig(
            cameras=[camera],
            output_dir=args.output,
            interval_seconds=args.interval,
            duration_seconds=args.duration,
            max_frames_per_camera=args.max_frames
        )
    else:
        parser.print_help()
        return

    # Run capture
    capture = DataCapture(config)
    capture.start()


if __name__ == "__main__":
    main()