# Sport Annotation Tool

A local video annotation tool for sports footage. Point it at a video, it detects people with RF-DETR, and opens a browser-based interface to annotate bounding boxes with classes, tags, and pair relationships.

Built for BJJ/combat sports but works for any sport with 2-4 main subjects.

---

## Requirements

- **Windows 10/11** (macOS/Linux: setup is manual, see below)
- **Python 3.10+** — [python.org](https://python.org) — tick "Add to PATH" during install
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **pnpm** — open a terminal and run `npm install -g pnpm`
- **GPU strongly recommended** — detection runs on CPU but is very slow (10-20× slower). NVIDIA GPU with CUDA will process a 5-min video in ~2 min; CPU takes 20-40 min.

> **First run** downloads RF-DETR base weights (~300 MB). Keep the terminal open and wait — it only happens once.

---

## Setup (one time)

Double-click **`setup.bat`** — it installs Python and frontend dependencies.

Or manually:
```
pip install -r requirements.txt
cd app && pnpm install
```

---

## Annotating a video

**Drag your video file onto `annotate.bat`** (or double-click it and enter the path).

What happens:
1. RF-DETR detects all people in the video at 8fps (~2-5 min for a 5-min clip)
2. Two terminal windows open (backend server + UI)
3. Browser opens automatically at `http://localhost:5173`

> First run downloads RF-DETR base weights (~300MB). Subsequent runs are instant.
> To use your own finetuned weights: `python prep_clip.py --video clip.mp4 --weights your_model.pth`

---

## Interface

**Canvas (left)** — click to select bboxes, drag to move/resize, drag empty area to draw a new bbox.

**Panel (right)** — class buttons, single-crop tags, pair tags, frame-level tags.

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `← →` | Navigate frames |
| `1` / `2` | Assign Athlete 1 / Athlete 2 |
| `r` / `c` / `f` | Assign Referee / Crowd / Fighter |
| `Space` | Focus tag input (bbox must be selected) |
| `Del` | Delete selected bbox |
| `Esc` | Deselect / cancel bulk mode |
| `P` | Propagate last annotated frame to current frame |
| Right-click canvas × 2 | Create a pair tag between two bboxes |
| Right-click frame strip × 2 | Enter bulk mode (set range, then apply a tag to all frames) |

**Canvas zoom / pan:**
- Scroll wheel to zoom in/out at cursor position
- Drag on empty canvas area when zoomed to pan
- Double-click to reset zoom

**Inline tag editing:**
- Double-click any tag chip (crop, pair, or frame) to rename it in place

**All Crops panel:**
- Shows athlete and referee bboxes at all times (no need to select one first)
- Tags are visible below each entry
- Click an entry to select it

**Frame states** (shown in top bar and frame strip):
- grey = untouched (will be excluded from export)
- blue = corrected (bboxes adjusted)
- green = tagged (has pair tags)

Leave frames **untagged** to discard them (crowd shots, blurry frames, off-screen athletes).

---

## Tag convention (suggested)

**Pair tags** — situation between athlete_1 and athlete_2:
`standing`, `takedown`, `guard`, `side-control`, `mount`, `back-control`, `turtle`, `transition`, `blob` (merged bboxes), `occlusion`, `hand-fight`, `double-leg`, `single-leg`, `bodylock`, `suplex`

**Single tags** — per-athlete state:
`top`, `bottom`, `attacking`, `defending`, `takedown-attempt`, `taken-down`, `occluded`, `out`, `back-attack`, `single-leg`, grips: `collar-right`, `grip-left-wrist`, etc.

**Frame tags** — frame quality:
`blur`, `cut` (new sequence), `new-fight`, `ref-occlusion`

---

## Output

Annotations are saved automatically to `outputs/<video_name>/annotations.json`.

Export to COCO JSON via the **Export COCO JSON** button in the panel.

---

## Options

```
python prep_clip.py --video clip.mp4 --fps 4 --conf 0.3 --port 8000
```

| Flag | Default | Description |
|------|---------|-------------|
| `--fps` | 8 | Sampling rate |
| `--conf` | 0.25 | Detection confidence threshold |
| `--weights` | base model | Path to custom RF-DETR .pth weights |
| `--out-dir` | outputs/ | Where to save frames.json and annotations |
| `--port` | 8000 | Backend server port |

---

## macOS / Linux

No `.bat` files, but it works. Run manually in two terminals:

```bash
# Terminal 1 — detection + backend
pip install -r requirements.txt
python prep_clip.py --video /path/to/clip.mp4

# Terminal 2 — frontend (after backend starts)
cd app
pnpm install   # first time only
pnpm dev
```

Then open `http://localhost:5173`.
