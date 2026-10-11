"""Analyze lane videos with YOLOv8 COCO weights; counts are estimates, not sensor truth."""
import base64
import json
import sys
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

VEHICLE_CLASSES = {1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
CONFIDENCE = 0.35
MAX_FRAMES = 120


def analyze_one(model, label, path):
    started = time.perf_counter()
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"{label}: video cannot be opened. Try MP4 (H.264) or AVI.")
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    interval = max(1, total_frames // MAX_FRAMES) if total_frames > 0 else 12
    frame_index = sampled = 0
    tracked_classes = {}
    peak_counts = {}
    peak_visible = 0
    best_frame = None
    best_count = -1
    frame_records = []
    predictor = getattr(model, "predictor", None)
    for tracker in getattr(predictor, "trackers", []):
        tracker.reset()
    try:
        while sampled < MAX_FRAMES:
            ok, frame = cap.read()
            if not ok:
                break
            if frame_index % interval == 0:
                prediction = model.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False, conf=CONFIDENCE)[0]
                frame_counts = {}
                annotated = frame.copy()
                boxes = prediction.boxes
                if boxes is not None:
                    ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(boxes)
                    for index, box in enumerate(boxes):
                        class_id = int(box.cls.item())
                        if class_id not in VEHICLE_CLASSES:
                            continue
                        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                        confidence = float(box.conf.item())
                        name = VEHICLE_CLASSES[class_id]
                        frame_counts[name] = frame_counts.get(name, 0) + 1
                        track_id = ids[index]
                        if track_id is not None:
                            tracked_classes.setdefault(int(track_id), name)
                        color = (0, 160, 255)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        track_label = f" ID {track_id}" if track_id is not None else ""
                        caption = f"{name.title()} {confidence:.2f}{track_label}"
                        cv2.putText(annotated, caption, (x1, max(18, y1-6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
                for name, count in frame_counts.items():
                    peak_counts[name] = max(peak_counts.get(name, 0), count)

                visible = sum(frame_counts.values())
                peak_visible = max(peak_visible, visible)
                if visible > best_count:
                    best_count, best_frame = visible, annotated
                frame_records.append({"frame": frame_index, "time_seconds": round(frame_index/fps, 2) if fps > 0 else None, "vehicles_visible": visible})
                sampled += 1
            frame_index += 1
    finally:
        cap.release()

    unique_counts = {}
    for name in tracked_classes.values():
        unique_counts[name] = unique_counts.get(name, 0) + 1
    # If the tracker cannot assign IDs, report a conservative peak snapshot rather than
    # inventing unique-track totals by treating every sampled detection as a new vehicle.
    tracking_method = "YOLO ByteTrack IDs" if tracked_classes else "peak-visible fallback; track IDs unavailable"
    if not tracked_classes:
        unique_counts = dict(peak_counts)
    total_unique = sum(unique_counts.values())
    image = None
    if best_frame is not None:
        ok, encoded = cv2.imencode(".jpg", best_frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if ok:
            image = base64.b64encode(encoded).decode("ascii")
    if sampled == 0:
        raise ValueError(f"{label}: no readable frames found in video.")
    return {
        "lane_label": label.replace("_", " ").title(),
        "vehicle_counts": unique_counts,
        "total_vehicles": total_unique,
        "peak_visible_vehicles": peak_visible,
        "peak_vehicle_counts": peak_counts,
        "possible_emergency_vehicle_count": 0,
        "possible_emergency_vehicle": False,
        "emergency_vehicle_detection": "Unavailable: COCO model has no emergency-vehicle class; operator review required.",
        "tracking_method": tracking_method,
        "frames_sampled": sampled,
        "duration_seconds": round(total_frames/fps, 2) if fps > 0 and total_frames > 0 else None,
        "processing_seconds": round(time.perf_counter()-started, 2),
        "annotated_frame_base64": image,
        "frame_samples": frame_records,
        "source": "YOLOV8_COCO_VIDEO_SAMPLE",
    }


def main():
    # CLI: analyze_videos.py result.json lane_1=path.mp4 lane_2=path.mp4 ...
    output_path = Path(sys.argv[1])
    lane_args = sys.argv[2:]
    model = YOLO("yolov8n.pt")
    lanes = [analyze_one(model, arg.split("=", 1)[0], Path(arg.split("=", 1)[1])) for arg in lane_args]
    result = {"lanes": lanes, "any_possible_emergency_vehicle": False, "note": "YOLOv8 COCO detections sampled across each uploaded clip. Unique counts use ByteTrack IDs when available; if IDs cannot be assigned, the peak visible count is shown as a conservative fallback. These are estimates, not exact stop-line crossing counts. This model does not identify ambulances or emergency vehicles; review footage and report confirmed emergencies manually."}
    output_path.write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Video analysis failed: {exc}", file=sys.stderr)
        sys.exit(2)
