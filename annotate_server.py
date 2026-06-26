"""
Sport Annotation Tool — FastAPI backend.

Reads an existing frames.json (produced by prep_clip.py) + source video,
serves frames and annotations for the React frontend.
"""

import argparse
import json
from pathlib import Path
from typing import Optional

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ── Global state ──────────────────────────────────────────────────────────────

STATE: dict = {
    "frames": [],
    "video_path": "",
    "frame_width": 0,
    "frame_height": 0,
    "annotations_path": "",
    "annotations": {},   # str(idx) -> dict
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class BboxData(BaseModel):
    id: int
    x1: float; y1: float; x2: float; y2: float
    conf: float = 1.0
    cls: Optional[str] = None
    single_tags: list[str] = []

class PairTag(BaseModel):
    a: int; b: int; tag: str

class FrameAnnotation(BaseModel):
    frame_idx: int
    state: str = "raw"
    bboxes: list[BboxData] = []
    pair_tags: list[PairTag] = []
    frame_tags: list[str] = []

class PropagateRequest(BaseModel):
    source_idx: int   # copy from this frame
    from_idx: int     # fill starting here
    to_idx: int       # fill up to and including here


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/meta")
def get_meta():
    return {
        "total": len(STATE["frames"]),
        "frame_width": STATE["frame_width"],
        "frame_height": STATE["frame_height"],
        "frames": [
            {
                "idx": i,
                "frame_number": f["frame"],
                "timestamp": round(f["timestamp"], 2),
                "n_dets": len(f["detections"]),
                "state": STATE["annotations"].get(str(i), {}).get("state", "raw"),
            }
            for i, f in enumerate(STATE["frames"])
        ],
    }


@app.get("/api/frame/{idx}")
def get_frame(idx: int):
    if idx < 0 or idx >= len(STATE["frames"]):
        raise HTTPException(404)
    frame_num = STATE["frames"][idx]["frame"]
    cap = cv2.VideoCapture(STATE["video_path"])
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num - 1)
    ret, img = cap.read()
    cap.release()
    if not ret:
        raise HTTPException(500, "Could not read frame")
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return Response(bytes(buf), media_type="image/jpeg")


@app.get("/api/annotations/{idx}")
def get_annotations(idx: int):
    if idx < 0 or idx >= len(STATE["frames"]):
        raise HTTPException(404)
    key = str(idx)
    if key in STATE["annotations"]:
        return STATE["annotations"][key]
    # Return RF-DETR pre-annotations if no manual save yet
    dets = STATE["frames"][idx]["detections"]
    bboxes = []
    for i, d in enumerate(dets):
        b = d["bbox"]
        bboxes.append({
            "id": i,
            "x1": b[0], "y1": b[1], "x2": b[2], "y2": b[3],
            "conf": b[4] if len(b) > 4 else 1.0,
            "cls": None,
            "single_tags": [],
        })
    return {"frame_idx": idx, "state": "raw", "bboxes": bboxes, "pair_tags": [], "frame_tags": []}


@app.post("/api/annotations/{idx}")
def save_annotations(idx: int, data: FrameAnnotation):
    if idx < 0 or idx >= len(STATE["frames"]):
        raise HTTPException(404)
    STATE["annotations"][str(idx)] = data.model_dump()
    _flush()
    return {"ok": True}


@app.post("/api/propagate")
def propagate(req: PropagateRequest):
    n = len(STATE["frames"])
    if not (0 <= req.source_idx < n and 0 <= req.from_idx <= req.to_idx < n):
        raise HTTPException(400, "Invalid indices")
    source = STATE["annotations"].get(str(req.source_idx))
    if not source:
        raise HTTPException(400, "Source frame has no annotation")
    for idx in range(req.from_idx, req.to_idx + 1):
        STATE["annotations"][str(idx)] = {**source, "frame_idx": idx, "state": "corrected"}
    _flush()
    return {"ok": True, "count": req.to_idx - req.from_idx + 1}


@app.get("/api/export/coco")
def export_coco():
    CLS_TO_ID = {"athlete_1": 1, "athlete_2": 2, "referee": 3, "crowd": 4, "fighter": 5}
    images, annotations, ann_id = [], [], 1
    for key, ann in sorted(STATE["annotations"].items(), key=lambda x: int(x[0])):
        if ann["state"] not in ("corrected", "tagged"):
            continue
        idx = int(key)
        frame_num = STATE["frames"][idx]["frame"]
        img_id = idx + 1
        images.append({
            "id": img_id,
            "file_name": f"frame_{frame_num:06d}.jpg",
            "width": STATE["frame_width"],
            "height": STATE["frame_height"],
        })
        for b in ann["bboxes"]:
            if not b["cls"]:
                continue
            w, h = b["x2"] - b["x1"], b["y2"] - b["y1"]
            annotations.append({
                "id": ann_id, "image_id": img_id,
                "category_id": CLS_TO_ID.get(b["cls"], 5),
                "bbox": [b["x1"], b["y1"], w, h],
                "area": w * h, "iscrowd": 0,
            })
            ann_id += 1
    categories = [
        {"id": 1, "name": "athlete_1"}, {"id": 2, "name": "athlete_2"},
        {"id": 3, "name": "referee"},   {"id": 4, "name": "crowd"},
        {"id": 5, "name": "fighter"},
    ]
    return {"images": images, "annotations": annotations, "categories": categories}


def _flush():
    with open(STATE["annotations_path"], "w", encoding="utf-8") as f:
        json.dump(STATE["annotations"], f, indent=2)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames-json", required=True)
    ap.add_argument("--video",       required=True)
    ap.add_argument("--port",        type=int, default=8000)
    args = ap.parse_args()

    p = Path(args.frames_json)
    data = json.load(open(p, encoding="utf-8"))
    STATE["frames"]       = data["frames"]
    STATE["frame_width"]  = data["width"]
    STATE["frame_height"] = data["height"]
    STATE["video_path"]   = args.video
    STATE["annotations_path"] = str(p.parent / "annotations.json")

    ann_path = Path(STATE["annotations_path"])
    if ann_path.exists():
        STATE["annotations"] = json.load(open(ann_path, encoding="utf-8"))
        print(f"Loaded {len(STATE['annotations'])} saved annotations")

    print(f"{len(STATE['frames'])} frames | {STATE['frame_width']}x{STATE['frame_height']}")
    print(f"Frontend: cd app && pnpm dev  ->  http://localhost:5173")
    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
