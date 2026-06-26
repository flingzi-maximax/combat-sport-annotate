import { useEffect, useRef, useCallback, useState } from 'react';
import type { Bbox, FrameAnnotation, HandleType } from '../types';
import { CLS_COLOR } from '../types';
import { frameUrl } from '../api';

const HANDLE_RADIUS = 6;
const UNCLASSIFIED = '#f87171';

interface Props {
  frameIdx: number;
  frameWidth: number;
  frameHeight: number;
  annotation: FrameAnnotation | null;
  selectedId: number | null;
  pairFirstId: number | null;
  highlightedPairIds: { a: number; b: number } | null;
  onAnnotationChange: (a: FrameAnnotation) => void;
  onSelect: (id: number | null) => void;
  onPairSelect: (id: number) => void;
}

type DragState =
  | { type: 'move';   bboxId: number; ox: number; oy: number; orig: Bbox }
  | { type: 'resize'; bboxId: number; handle: HandleType; ox: number; oy: number; orig: Bbox }
  | { type: 'draw';   x0: number; y0: number; x1: number; y1: number }
  | { type: 'pan';    startCx: number; startCy: number; startPx: number; startPy: number };

const HANDLES: HandleType[] = ['TL','TC','TR','ML','MR','BL','BC','BR'];

function handlePos(b: Bbox, h: HandleType): [number, number] {
  const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
  switch (h) {
    case 'TL': return [b.x1, b.y1]; case 'TC': return [mx, b.y1];  case 'TR': return [b.x2, b.y1];
    case 'ML': return [b.x1, my];                                    case 'MR': return [b.x2, my];
    case 'BL': return [b.x1, b.y2]; case 'BC': return [mx, b.y2];  case 'BR': return [b.x2, b.y2];
  }
}

function applyResize(orig: Bbox, handle: HandleType, dx: number, dy: number): Bbox {
  const b = { ...orig };
  if (handle.includes('L')) b.x1 = orig.x1 + dx;
  if (handle.includes('R')) b.x2 = orig.x2 + dx;
  if (handle[0] === 'T')    b.y1 = orig.y1 + dy;
  if (handle[0] === 'B')    b.y2 = orig.y2 + dy;
  if (b.x1 > b.x2) [b.x1, b.x2] = [b.x2, b.x1];
  if (b.y1 > b.y2) [b.y1, b.y2] = [b.y2, b.y1];
  return b;
}

export default function AnnotationCanvas({
  frameIdx, frameWidth, frameHeight,
  annotation, selectedId, pairFirstId, highlightedPairIds,
  onAnnotationChange, onSelect, onPairSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef(new Image());
  const dragRef      = useRef<DragState | null>(null);
  const annRef       = useRef(annotation);
  annRef.current = annotation;

  // zoom / pan state — kept in refs so wheel handler (added imperatively) can read them
  const [zoom, setZoom]           = useState(1);
  const [panX, setPanX]           = useState(0);
  const [panY, setPanY]           = useState(0);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const panXRef = useRef(panX); panXRef.current = panX;
  const panYRef = useRef(panY); panYRef.current = panY;

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function getScale() {
    const c = canvasRef.current;
    if (!c || !frameWidth || !frameHeight) return { scale: 1, ox: 0, oy: 0 };
    const base = Math.min(c.width / frameWidth, c.height / frameHeight);
    const scale = base * zoomRef.current;
    const ox = (c.width  - frameWidth  * scale) / 2 + panXRef.current;
    const oy = (c.height - frameHeight * scale) / 2 + panYRef.current;
    return { scale, ox, oy };
  }

  function canvasToImg(cx: number, cy: number) {
    const { scale, ox, oy } = getScale();
    return { x: (cx - ox) / scale, y: (cy - oy) / scale };
  }

  function getMouseCanvas(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (canvasRef.current!.width  / rect.width),
      cy: (e.clientY - rect.top)  * (canvasRef.current!.height / rect.height),
    };
  }

  function getMouseImg(e: React.MouseEvent<HTMLCanvasElement>) {
    const { cx, cy } = getMouseCanvas(e);
    return canvasToImg(cx, cy);
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { scale, ox, oy } = getScale();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (imgRef.current.complete && imgRef.current.naturalWidth) {
      ctx.drawImage(imgRef.current, ox, oy, frameWidth * scale, frameHeight * scale);
    }

    const bboxes = annRef.current?.bboxes ?? [];

    if (dragRef.current?.type === 'draw') {
      const d = dragRef.current;
      const x1 = Math.min(d.x0, d.x1), y1 = Math.min(d.y0, d.y1);
      const x2 = Math.max(d.x0, d.x1), y2 = Math.max(d.y0, d.y1);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.strokeRect(ox + x1 * scale, oy + y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
      ctx.setLineDash([]);
    }

    for (const b of bboxes) {
      const col         = b.cls ? CLS_COLOR[b.cls] : UNCLASSIFIED;
      const isSelected  = b.id === selectedId;
      const isPairFirst = b.id === pairFirstId;
      const isHighlighted = highlightedPairIds !== null &&
        (b.id === highlightedPairIds.a || b.id === highlightedPairIds.b);

      const rx = ox + b.x1 * scale, ry = oy + b.y1 * scale;
      const rw = (b.x2 - b.x1) * scale, rh = (b.y2 - b.y1) * scale;

      if (isHighlighted) {
        ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 4]);
        ctx.strokeRect(rx - 4, ry - 4, rw + 8, rh + 8);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(232,121,249,0.10)';
        ctx.fillRect(rx, ry, rw, rh);
      }

      ctx.strokeStyle = isPairFirst ? '#ff00ff' : col;
      ctx.lineWidth   = isSelected ? 2.5 : 1.5;
      ctx.strokeRect(rx, ry, rw, rh);

      if (isSelected) { ctx.fillStyle = col + '22'; ctx.fillRect(rx, ry, rw, rh); }

      const label = b.cls ?? '?';
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = isPairFirst ? '#ff00ff' : col;
      ctx.fillRect(rx, ry - 16, tw + 8, 16);
      ctx.fillStyle = '#000';
      ctx.fillText(label, rx + 4, ry - 4);

      ctx.font = '9px monospace'; ctx.fillStyle = '#000000aa';
      ctx.fillText(`${Math.round(b.conf * 100)}%`, rx + 4, ry + 12);

      if (b.single_tags.length > 0) {
        ctx.fillStyle = col; ctx.font = 'bold 10px monospace';
        ctx.fillText(`[${b.single_tags.length}]`, rx + rw - 22, ry + 12);
      }

      if (isSelected) {
        for (const h of HANDLES) {
          const [hx, hy] = handlePos(b, h);
          const hcx = ox + hx * scale, hcy = oy + hy * scale;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.fillRect(hcx - HANDLE_RADIUS, hcy - HANDLE_RADIUS, HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
          ctx.strokeRect(hcx - HANDLE_RADIUS, hcy - HANDLE_RADIUS, HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
        }
      }
    }

    if (pairFirstId !== null) {
      ctx.fillStyle = 'rgba(255,0,255,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff00ff'; ctx.font = 'bold 14px monospace';
      ctx.fillText('PAIR MODE — right-click second bbox', 10, canvas.height - 10);
    }

    // zoom indicator
    if (zoomRef.current > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, 8, 68, 20);
      ctx.fillStyle = '#facc15'; ctx.font = 'bold 11px monospace';
      ctx.fillText(`${zoomRef.current.toFixed(1)}x  dbl-click=reset`, 14, 22);
    }
  }, [frameWidth, frameHeight, selectedId, pairFirstId, highlightedPairIds, zoom, panX, panY]);

  // ── Load frame ────────────────────────────────────────────────────────────

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw(); };
    img.src = frameUrl(frameIdx);
  }, [frameIdx]);

  useEffect(() => { redraw(); }, [annotation, selectedId, pairFirstId, highlightedPairIds, zoom, panX, panY, redraw]);

  // ── Canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      const cont = containerRef.current, canvas = canvasRef.current;
      if (!cont || !canvas) return;
      canvas.width  = cont.clientWidth;
      canvas.height = cont.clientHeight;
      redraw();
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [redraw]);

  // ── Wheel zoom (imperative to allow preventDefault) ───────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

      const factor   = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom  = Math.max(1, Math.min(12, zoomRef.current * factor));
      if (newZoom === zoomRef.current) return;

      // keep the canvas point (cx,cy) fixed in image space
      const { ox, oy, scale } = getScale();
      const imgX = (cx - ox) / scale;
      const imgY = (cy - oy) / scale;

      const base = Math.min(canvas.width / frameWidth, canvas.height / frameHeight);
      const newScale = base * newZoom;
      const newOx    = cx - imgX * newScale;
      const newOy    = cy - imgY * newScale;
      const defaultOx = (canvas.width  - frameWidth  * newScale) / 2;
      const defaultOy = (canvas.height - frameHeight * newScale) / 2;

      const newPanX = newOx - defaultOx;
      const newPanY = newOy - defaultOy;

      zoomRef.current = newZoom; panXRef.current = newPanX; panYRef.current = newPanY;
      setZoom(newZoom); setPanX(newPanX); setPanY(newPanY);
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [frameWidth, frameHeight]);

  // ── Hit testing ───────────────────────────────────────────────────────────

  function hitHandle(b: Bbox, mx: number, my: number): HandleType | null {
    const { scale } = getScale();
    const r = HANDLE_RADIUS / scale;
    for (const h of HANDLES) {
      const [hx, hy] = handlePos(b, h);
      if (Math.abs(mx - hx) < r && Math.abs(my - hy) < r) return h;
    }
    return null;
  }

  function hitBbox(bboxes: Bbox[], mx: number, my: number): Bbox | null {
    const sorted = [...bboxes].sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1));
    return sorted.find(b => mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2) ?? null;
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const { x, y } = getMouseImg(e);
    const { cx, cy } = getMouseCanvas(e);
    const bboxes = annRef.current?.bboxes ?? [];

    if (selectedId !== null) {
      const selBbox = bboxes.find(b => b.id === selectedId);
      if (selBbox) {
        const h = hitHandle(selBbox, x, y);
        if (h) { dragRef.current = { type: 'resize', bboxId: selBbox.id, handle: h, ox: x, oy: y, orig: { ...selBbox } }; return; }
      }
    }

    const hit = hitBbox(bboxes, x, y);
    if (hit) {
      onSelect(hit.id);
      dragRef.current = { type: 'move', bboxId: hit.id, ox: x, oy: y, orig: { ...hit } };
      return;
    }

    onSelect(null);
    if (zoomRef.current > 1) {
      // pan mode when zoomed
      dragRef.current = { type: 'pan', startCx: cx, startCy: cy, startPx: panXRef.current, startPy: panYRef.current };
    } else {
      dragRef.current = { type: 'draw', x0: x, y0: y, x1: x, y1: y };
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current || !annRef.current) return;
    const { x, y } = getMouseImg(e);
    const { cx, cy } = getMouseCanvas(e);
    const d = dragRef.current;
    const bboxes = [...annRef.current.bboxes];

    if (d.type === 'move') {
      const dx = x - d.ox, dy = y - d.oy;
      const idx = bboxes.findIndex(b => b.id === d.bboxId);
      if (idx >= 0) {
        bboxes[idx] = { ...d.orig, x1: d.orig.x1 + dx, y1: d.orig.y1 + dy, x2: d.orig.x2 + dx, y2: d.orig.y2 + dy };
        annRef.current = { ...annRef.current, bboxes };
        redraw();
      }
    } else if (d.type === 'resize') {
      const dx = x - d.ox, dy = y - d.oy;
      const idx = bboxes.findIndex(b => b.id === d.bboxId);
      if (idx >= 0) { bboxes[idx] = applyResize(d.orig, d.handle, dx, dy); annRef.current = { ...annRef.current, bboxes }; redraw(); }
    } else if (d.type === 'draw') {
      d.x1 = x; d.y1 = y; redraw();
    } else if (d.type === 'pan') {
      const newPanX = d.startPx + (cx - d.startCx);
      const newPanY = d.startPy + (cy - d.startCy);
      panXRef.current = newPanX; panYRef.current = newPanY;
      setPanX(newPanX); setPanY(newPanY);
      redraw();
    }
  }

  function handleMouseUp(_e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current || !annRef.current) return;
    const d = dragRef.current;

    if (d.type === 'draw') {
      const x1 = Math.min(d.x0, d.x1), y1 = Math.min(d.y0, d.y1);
      const x2 = Math.max(d.x0, d.x1), y2 = Math.max(d.y0, d.y1);
      if (x2 - x1 > 5 && y2 - y1 > 5) {
        const newId = Math.max(-1, ...annRef.current.bboxes.map(b => b.id)) + 1;
        const newBbox: Bbox = { id: newId, x1, y1, x2, y2, conf: 1, cls: null, single_tags: [] };
        const updated = { ...annRef.current, bboxes: [...annRef.current.bboxes, newBbox], state: 'corrected' as const };
        onAnnotationChange(updated);
        onSelect(newId);
      }
    } else if (d.type !== 'pan') {
      onAnnotationChange({ ...annRef.current, state: 'corrected' });
    }

    dragRef.current = null;
    redraw();
  }

  function handleContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const { x, y } = getMouseImg(e);
    const hit = hitBbox(annRef.current?.bboxes ?? [], x, y);
    if (hit) onPairSelect(hit.id);
  }

  function handleDoubleClick() {
    zoomRef.current = 1; panXRef.current = 0; panYRef.current = 0;
    setZoom(1); setPanX(0); setPanY(0);
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  function getCursor(e: React.MouseEvent<HTMLCanvasElement>): string {
    if (dragRef.current?.type === 'pan') return 'grabbing';
    const { x, y } = getMouseImg(e);
    const bboxes = annRef.current?.bboxes ?? [];
    if (selectedId !== null) {
      const sel = bboxes.find(b => b.id === selectedId);
      if (sel && hitHandle(sel, x, y)) return 'nwse-resize';
    }
    if (hitBbox(bboxes, x, y)) return 'move';
    return zoomRef.current > 1 ? 'grab' : 'crosshair';
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 bg-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseMoveCapture={e => { const canvas = canvasRef.current; if (canvas) canvas.style.cursor = getCursor(e); }}
      />
    </div>
  );
}
