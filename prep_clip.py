"""
prep_clip.py — sample a clip, run RF-DETR locally, launch annotation server.

Usage:
    python prep_clip.py --video path/to/video.mp4
    python prep_clip.py --video path/to/video.mp4 --fps 8 --weights rf-detr-large-2026.pth
"""

import argparse
import json
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

import cv2
from PIL import Image as PILImage

CREATE_NEW_CONSOLE = 0x00000010  # Windows flag: open a new terminal window


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video",    required=True,   help="Input video file")
    ap.add_argument("--fps",      type=float, default=8.0,   help="Sampling rate (default: 8)")
    ap.add_argument("--conf",     type=float, default=0.25,  help="Detection confidence threshold (default: 0.25)")
    ap.add_argument("--weights",  default="rf-detr-large-2026.pth",
                    help="Local RF-DETR .pth weights; omit to use downloaded base model")
    ap.add_argument("--out-dir",  default="outputs")
    ap.add_argument("--port",     type=int, default=8000)
    args = ap.parse_args()

    video_path = Path(args.video)
    if not video_path.exists():
        sys.exit(f"Video not found: {video_path}")

    stem    = video_path.stem
    out_dir = Path(args.out_dir) / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    frames_json = out_dir / "frames.json"

    # ── Load RF-DETR ─────────────────────────────────────────────────────────────

    from rfdetr import RFDETRLarge
    weights = Path(args.weights)
    if weights.exists():
        print(f"Loading RF-DETR from {weights} ...", flush=True)
        model = RFDETRLarge(pretrain_weights=str(weights))
    else:
        if args.weights != "rf-detr-large-2026.pth":
            print(f"Warning: {args.weights} not found, using base weights", flush=True)
        print("Loading RF-DETR (base pretrained) ...", flush=True)
        model = RFDETRLarge()
    model.optimize_for_inference()

    PERSON_IDS = {0, 1}

    # ── Sample video ──────────────────────────────────────────────────────────────

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS)
    total   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step    = max(1, round(src_fps / args.fps))
    n_exp   = total // step

    print(f"\n{stem}  {width}x{height} @ {src_fps:.1f}fps  "
          f"step={step} -> ~{n_exp} frames @ ~{src_fps/step:.1f}fps effective", flush=True)

    frames    = []
    frame_num = 0

    while True:
        ret, img = cap.read()
        if not ret:
            break
        frame_num += 1
        if (frame_num - 1) % step != 0:
            continue

        timestamp  = frame_num / src_fps
        pil_img    = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        detections = model.predict(pil_img, threshold=args.conf)

        dets = []
        if detections.class_id is not None and len(detections.class_id) > 0:
            for i, cid in enumerate(detections.class_id):
                if int(cid) not in PERSON_IDS:
                    continue
                x1, y1, x2, y2 = [float(v) for v in detections.xyxy[i]]
                conf = float(detections.confidence[i])
                dets.append({"bbox": [x1, y1, x2, y2, conf]})
        dets.sort(key=lambda d: d["bbox"][4], reverse=True)

        frames.append({
            "frame":      frame_num,
            "timestamp":  round(timestamp, 3),
            "detections": dets,
        })

        if len(frames) % 10 == 0:
            print(f"  [{len(frames):4d}/{n_exp}]  frame {frame_num:5d}  "
                  f"t={timestamp:6.1f}s  dets={len(dets)}", flush=True)

    cap.release()

    total_dets = sum(len(f["detections"]) for f in frames)
    avg_dets   = total_dets / len(frames) if frames else 0
    print(f"\n  {len(frames)} frames  |  {total_dets} detections  |  {avg_dets:.1f} avg/frame", flush=True)

    data = {"width": width, "height": height, "frames": frames}
    with open(frames_json, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"  Saved -> {frames_json}", flush=True)

    # ── Launch server + UI ────────────────────────────────────────────────────────

    server_script = Path(__file__).parent / "annotate_server.py"
    app_dir       = Path(__file__).parent / "app"

    print(f"\nStarting annotation server ...", flush=True)

    import platform
    if platform.system() == "Windows":
        subprocess.Popen(
            [sys.executable, str(server_script),
             "--frames-json", str(frames_json.absolute()),
             "--video",       str(video_path.absolute()),
             "--port",        str(args.port)],
            creationflags=CREATE_NEW_CONSOLE,
        )
        subprocess.Popen(
            ["cmd", "/k", "pnpm dev"],
            cwd=str(app_dir),
            creationflags=CREATE_NEW_CONSOLE,
        )
        print("  Waiting for services to start ...", flush=True)
        time.sleep(5)
        webbrowser.open("http://localhost:5173")
        print("  Browser opened: http://localhost:5173", flush=True)
        print("  Close the two terminal windows to stop.", flush=True)
    else:
        # macOS / Linux
        subprocess.Popen([sys.executable, str(server_script),
                          "--frames-json", str(frames_json),
                          "--video", str(video_path),
                          "--port", str(args.port)])
        print(f"  Backend running on port {args.port}", flush=True)
        print(f"  In another terminal: cd app && pnpm dev", flush=True)
        print(f"  Then open: http://localhost:5173", flush=True)


if __name__ == "__main__":
    main()
