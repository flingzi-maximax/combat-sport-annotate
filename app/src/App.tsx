import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppMeta, FrameAnnotation, BboxClass } from './types';
import { fetchMeta, fetchAnnotations, saveAnnotations, propagateAnnotation } from './api';
import AnnotationCanvas from './components/AnnotationCanvas';
import BboxPanel from './components/BboxPanel';
import FrameStrip from './components/FrameStrip';

const CLS_MAP: Record<string, BboxClass> = {
  '1': 'athlete_1', '2': 'athlete_2',
  'r': 'referee', 'c': 'crowd', 'f': 'fighter',
};

const STATE_BADGE: Record<string, string> = {
  raw:       'bg-zinc-700 text-zinc-400',
  corrected: 'bg-blue-900 text-blue-300',
  tagged:    'bg-green-900 text-green-300',
};

export default function App() {
  const [meta, setMeta]             = useState<AppMeta | null>(null);
  const [frameIdx, setFrameIdx]     = useState(0);
  const [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pairFirstId, setPairFirstId] = useState<number | null>(null);
  const [highlightedPairIds, setHighlightedPairIds] = useState<{a: number, b: number} | null>(null);
  const [pairSecondId, setPairSecondId] = useState<number | null>(null);
  const [pairTagInput, setPairTagInput] = useState('');

  // bulk mode
  const [bulkStart, setBulkStart]   = useState<number | null>(null);
  const [bulkRange, setBulkRange]   = useState<[number, number] | null>(null);
  const [bulkTag, setBulkTag]       = useState('');
  const [bulkType, setBulkType]     = useState<'frame' | 'single' | 'pair'>('frame');
  const [bulkCls, setBulkCls]       = useState<BboxClass>('athlete_1');
  const [bulkApplying, setBulkApplying] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);

  const frameIdxRef   = useRef(frameIdx);   frameIdxRef.current   = frameIdx;
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId;
  const annotationRef = useRef(annotation); annotationRef.current = annotation;
  const metaRef       = useRef(meta);       metaRef.current       = meta;

  // ── Load meta ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error);
  }, []);

  // ── Load annotation when frame changes ───────────────────────────────────────

  useEffect(() => {
    setSelectedId(null);
    setPairFirstId(null);
    setPairSecondId(null);
    setHighlightedPairIds(null);
    fetchAnnotations(frameIdx).then(setAnnotation).catch(console.error);
  }, [frameIdx]);

  // ── Auto-save ────────────────────────────────────────────────────────────────

  const handleAnnotationChange = useCallback((a: FrameAnnotation) => {
    setAnnotation(a);
    saveAnnotations(frameIdxRef.current, a).catch(console.error);
    setMeta(prev => {
      if (!prev) return prev;
      return { ...prev, frames: prev.frames.map(f => f.idx === frameIdxRef.current ? { ...f, state: a.state } : f) };
    });
  }, []);

  // ── Pair select ───────────────────────────────────────────────────────────────

  function handlePairSelect(id: number) {
    if (pairFirstId === null) setPairFirstId(id);
    else if (pairFirstId === id) setPairFirstId(null);
    else setPairSecondId(id);
  }

  function commitPairTag(tag: string) {
    const ann = annotationRef.current;
    if (!ann || pairFirstId === null || pairSecondId === null) return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    handleAnnotationChange({ ...ann, pair_tags: [...ann.pair_tags, { a: pairFirstId, b: pairSecondId, tag: trimmed }], state: 'tagged' });
    setPairFirstId(null); setPairSecondId(null); setPairTagInput('');
  }

  function cancelPairDialog() { setPairSecondId(null); setPairFirstId(null); setPairTagInput(''); }

  // ── Delete bbox ───────────────────────────────────────────────────────────────

  function handleDeleteBbox() {
    const ann = annotationRef.current;
    const si  = selectedIdRef.current;
    if (!ann || si === null) return;
    handleAnnotationChange({ ...ann, bboxes: ann.bboxes.filter(b => b.id !== si), state: 'corrected' });
    setSelectedId(null);
  }

  // ── Bulk mode ─────────────────────────────────────────────────────────────────

  function handleBulkSelect(idx: number) {
    if (bulkRange !== null) return; // already in action mode, ignore
    if (bulkStart === null) {
      setBulkStart(idx);
    } else if (bulkStart === idx) {
      setBulkStart(null);
    } else {
      setBulkRange([Math.min(bulkStart, idx), Math.max(bulkStart, idx)]);
      setBulkStart(null);
    }
  }

  function cancelBulk() { setBulkStart(null); setBulkRange(null); setBulkTag(''); }

  async function applyBulk() {
    if (!bulkRange || !bulkTag.trim() || bulkApplying) return;
    const tag = bulkTag.trim();
    const [from, to] = bulkRange;
    setBulkApplying(true);

    for (let idx = from; idx <= to; idx++) {
      const ann = await fetchAnnotations(idx);
      let updated: FrameAnnotation | null = null;

      if (bulkType === 'frame') {
        if (!ann.frame_tags.includes(tag))
          updated = { ...ann, frame_tags: [...ann.frame_tags, tag] };

      } else if (bulkType === 'single') {
        const newBboxes = ann.bboxes.map(b =>
          b.cls === bulkCls && !b.single_tags.includes(tag)
            ? { ...b, single_tags: [...b.single_tags, tag] }
            : b
        );
        if (newBboxes.some((b, i) => b !== ann.bboxes[i]))
          updated = { ...ann, bboxes: newBboxes };

      } else { // pair
        if (!ann.pair_tags.some(pt => pt.tag === tag)) {
          let pairA: number, pairB: number;
          if (ann.pair_tags.length > 0) {
            pairA = ann.pair_tags[0].a; pairB = ann.pair_tags[0].b;
          } else {
            const a1 = ann.bboxes.find(b => b.cls === 'athlete_1');
            const a2 = ann.bboxes.find(b => b.cls === 'athlete_2');
            if (a1 && a2) { pairA = a1.id; pairB = a2.id; }
            else if (ann.bboxes.length >= 2) { pairA = ann.bboxes[0].id; pairB = ann.bboxes[1].id; }
            else continue;
          }
          updated = { ...ann, pair_tags: [...ann.pair_tags, { a: pairA, b: pairB, tag }] };
        }
      }

      if (updated) await saveAnnotations(idx, updated);
    }

    // reload current frame if in range
    const fi = frameIdxRef.current;
    if (fi >= from && fi <= to) fetchAnnotations(fi).then(setAnnotation).catch(console.error);

    setBulkApplying(false);
    cancelBulk();
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const m   = metaRef.current;
      const fi  = frameIdxRef.current;
      const si  = selectedIdRef.current;
      const ann = annotationRef.current;

      if (e.key === 'ArrowRight') { setFrameIdx(prev => m ? Math.min(prev + 1, m.total - 1) : prev); return; }
      if (e.key === 'ArrowLeft')  { setFrameIdx(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Escape') {
        setSelectedId(null); setPairFirstId(null); setPairSecondId(null);
        cancelBulk();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        if (!m) return;
        let sourceIdx = -1;
        for (let i = fi - 1; i >= 0; i--) {
          if (m.frames[i].state === 'corrected' || m.frames[i].state === 'tagged') { sourceIdx = i; break; }
        }
        if (sourceIdx < 0) return;
        const fromIdx = sourceIdx + 1, toIdx = fi;
        if (fromIdx > toIdx) return;
        propagateAnnotation(sourceIdx, fromIdx, toIdx).then(({ count }) => {
          setMeta(prev => prev ? { ...prev, frames: prev.frames.map(f => f.idx >= fromIdx && f.idx <= toIdx ? { ...f, state: 'corrected' } : f) } : prev);
          fetchAnnotations(fi).then(setAnnotation).catch(console.error);
          console.log(`Propagated to ${count} frames`);
        }).catch(console.error);
        return;
      }
      if (e.key === ' ') {
        if (si !== null) { e.preventDefault(); tagInputRef.current?.focus(); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && si !== null && ann) {
        setAnnotation({ ...ann, bboxes: ann.bboxes.filter(b => b.id !== si), state: 'corrected' });
        saveAnnotations(fi, { ...ann, bboxes: ann.bboxes.filter(b => b.id !== si), state: 'corrected' }).catch(console.error);
        setSelectedId(null);
        return;
      }
      const cls = CLS_MAP[e.key.toLowerCase()];
      if (cls && si !== null && ann) {
        const updated = { ...ann, bboxes: ann.bboxes.map(b => b.id === si ? { ...b, cls } : b), state: 'corrected' as const };
        setAnnotation(updated);
        saveAnnotations(fi, updated).catch(console.error);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!meta) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400 font-mono text-sm">
        Connecting to backend…
      </div>
    );
  }

  const currentFrame = meta.frames[frameIdx];

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">

      {/* Top status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="font-mono font-bold text-zinc-200 text-sm">Sport Annotate</span>
        <span className="text-zinc-600">|</span>
        <span className="font-mono text-xs text-zinc-400">
          frame {currentFrame.frame_number} · {currentFrame.timestamp.toFixed(2)}s · {currentFrame.n_dets} dets
        </span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATE_BADGE[currentFrame.state] ?? STATE_BADGE.raw}`}>
          {currentFrame.state}
        </span>
        <span className="text-xs text-zinc-600 font-mono ml-auto">{frameIdx + 1} / {meta.total}</span>
        <span className="text-xs text-zinc-600 font-mono">
          ← → navigate · 1/2/r/c/f class · Space tag · Del delete · P propagate · right-click strip = bulk
        </span>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <AnnotationCanvas
          frameIdx={frameIdx}
          frameWidth={meta.frame_width}
          frameHeight={meta.frame_height}
          annotation={annotation}
          selectedId={selectedId}
          pairFirstId={pairFirstId}
          highlightedPairIds={highlightedPairIds}
          onAnnotationChange={handleAnnotationChange}
          onSelect={setSelectedId}
          onPairSelect={handlePairSelect}
        />
        <BboxPanel
          annotation={annotation}
          selectedId={selectedId}
          pairFirstId={pairFirstId}
          tagInputRef={tagInputRef}
          highlightedPairIds={highlightedPairIds}
          onHighlightPair={setHighlightedPairIds}
          onAnnotationChange={handleAnnotationChange}
          onDeleteBbox={handleDeleteBbox}
          onSelect={setSelectedId}
        />
      </div>

      {/* Bulk action bar */}
      {(bulkStart !== null || bulkRange !== null) && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-950 border-t border-amber-800 shrink-0">
          {bulkRange === null ? (
            <>
              <span className="text-xs text-amber-400 font-mono">
                Frame {bulkStart} marked — right-click another frame to set range
              </span>
              <button onClick={cancelBulk} className="ml-auto px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300">Cancel [Esc]</button>
            </>
          ) : (
            <>
              <span className="text-xs text-amber-300 font-mono shrink-0">
                Bulk: {bulkRange[0]}–{bulkRange[1]} ({bulkRange[1] - bulkRange[0] + 1} frames)
              </span>
              <span className="text-zinc-600">|</span>
              <select
                className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono"
                value={bulkType}
                onChange={e => setBulkType(e.target.value as 'frame' | 'single' | 'pair')}
              >
                <option value="frame">Frame tag</option>
                <option value="single">Single tag</option>
                <option value="pair">Pair tag</option>
              </select>
              {bulkType === 'single' && (
                <select
                  className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono"
                  value={bulkCls}
                  onChange={e => setBulkCls(e.target.value as BboxClass)}
                >
                  <option value="athlete_1">Athlete 1</option>
                  <option value="athlete_2">Athlete 2</option>
                  <option value="referee">Referee</option>
                  <option value="crowd">Crowd</option>
                  <option value="fighter">Fighter</option>
                </select>
              )}
              <input
                autoFocus
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                placeholder="tag name + Enter to apply"
                value={bulkTag}
                onChange={e => setBulkTag(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); applyBulk(); }
                  if (e.key === 'Escape') cancelBulk();
                }}
              />
              <button
                onClick={applyBulk}
                disabled={bulkApplying}
                className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-xs text-amber-100 font-mono shrink-0"
              >
                {bulkApplying ? 'Applying…' : 'Apply'}
              </button>
              <button onClick={cancelBulk} className="px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300 shrink-0">Cancel</button>
            </>
          )}
        </div>
      )}

      {/* Frame strip */}
      <FrameStrip
        frames={meta.frames}
        currentIdx={frameIdx}
        bulkStart={bulkStart}
        bulkRange={bulkRange}
        onSelect={setFrameIdx}
        onBulkSelect={handleBulkSelect}
      />

      {/* Pair tag dialog */}
      {pairSecondId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 w-80 shadow-xl">
            <div className="text-sm font-mono text-zinc-300 mb-3">
              Pair tag: bbox <span className="text-fuchsia-400">#{pairFirstId}</span> ↔ <span className="text-fuchsia-400">#{pairSecondId}</span>
            </div>
            <input
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-400 font-mono"
              placeholder="e.g. underhook, grip, clinch…"
              value={pairTagInput}
              onChange={e => setPairTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitPairTag(pairTagInput);
                if (e.key === 'Escape') cancelPairDialog();
              }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => commitPairTag(pairTagInput)} className="flex-1 px-3 py-1.5 bg-fuchsia-800 hover:bg-fuchsia-700 rounded text-sm text-fuchsia-200 transition-colors font-mono">
                Add Tag
              </button>
              <button onClick={cancelPairDialog} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-zinc-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
