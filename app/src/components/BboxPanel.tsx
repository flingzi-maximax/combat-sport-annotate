import { useState } from 'react';
import type { BboxClass, FrameAnnotation } from '../types';
import { CLS_COLOR } from '../types';
import { exportCoco } from '../api';

const CLS_KEYS: { key: string; cls: BboxClass; label: string }[] = [
  { key: '1', cls: 'athlete_1', label: 'Athlete 1' },
  { key: '2', cls: 'athlete_2', label: 'Athlete 2' },
  { key: 'r', cls: 'referee',   label: 'Referee' },
  { key: 'c', cls: 'crowd',     label: 'Crowd' },
  { key: 'f', cls: 'fighter',   label: 'Fighter' },
];

interface Props {
  annotation: FrameAnnotation | null;
  selectedId: number | null;
  pairFirstId: number | null;
  tagInputRef: React.RefObject<HTMLInputElement>;
  highlightedPairIds: { a: number; b: number } | null;
  onAnnotationChange: (a: FrameAnnotation) => void;
  onDeleteBbox: () => void;
  onHighlightPair: (ids: { a: number; b: number } | null) => void;
  onSelect: (id: number) => void;
}

export default function BboxPanel({
  annotation, selectedId, pairFirstId,
  tagInputRef, highlightedPairIds, onHighlightPair,
  onAnnotationChange, onDeleteBbox, onSelect,
}: Props) {
  const [tagInput, setTagInput]           = useState('');
  const [frameTagInput, setFrameTagInput] = useState('');

  // inline editing state
  const [editingSingleTag, setEditingSingleTag]       = useState<string | null>(null);
  const [editingSingleTagVal, setEditingSingleTagVal] = useState('');
  const [editingPairTagIdx, setEditingPairTagIdx]     = useState<number | null>(null);
  const [editingPairTagVal, setEditingPairTagVal]     = useState('');
  const [editingFrameTag, setEditingFrameTag]         = useState<string | null>(null);
  const [editingFrameTagVal, setEditingFrameTagVal]   = useState('');

  const selected = annotation?.bboxes.find(b => b.id === selectedId) ?? null;

  // ── Class ────────────────────────────────────────────────────────────────────

  function setClass(cls: BboxClass) {
    if (!annotation || selectedId === null) return;
    const bboxes = annotation.bboxes.map(b => b.id === selectedId ? { ...b, cls } : b);
    onAnnotationChange({ ...annotation, bboxes, state: 'corrected' });
  }

  // ── Single tags ───────────────────────────────────────────────────────────────

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || !annotation || selectedId === null) return;
    const bboxes = annotation.bboxes.map(b =>
      b.id === selectedId && !b.single_tags.includes(tag)
        ? { ...b, single_tags: [...b.single_tags, tag] }
        : b
    );
    onAnnotationChange({ ...annotation, bboxes });
    setTagInput('');
  }

  function removeTag(tag: string) {
    if (!annotation || selectedId === null) return;
    const bboxes = annotation.bboxes.map(b =>
      b.id === selectedId ? { ...b, single_tags: b.single_tags.filter(t => t !== tag) } : b
    );
    onAnnotationChange({ ...annotation, bboxes });
  }

  function renameSingleTag(oldTag: string, newTag: string) {
    setEditingSingleTag(null);
    const trimmed = newTag.trim();
    if (!annotation || selectedId === null || !trimmed || trimmed === oldTag) return;
    const bboxes = annotation.bboxes.map(b =>
      b.id === selectedId
        ? { ...b, single_tags: b.single_tags.map(t => t === oldTag ? trimmed : t) }
        : b
    );
    onAnnotationChange({ ...annotation, bboxes });
  }

  // ── Pair tags ─────────────────────────────────────────────────────────────────

  function removePairTag(idx: number) {
    if (!annotation) return;
    onAnnotationChange({ ...annotation, pair_tags: annotation.pair_tags.filter((_, i) => i !== idx) });
  }

  function renamePairTag(idx: number, newTag: string) {
    setEditingPairTagIdx(null);
    const trimmed = newTag.trim();
    if (!annotation || !trimmed) return;
    const pair_tags = annotation.pair_tags.map((pt, i) => i === idx ? { ...pt, tag: trimmed } : pt);
    onAnnotationChange({ ...annotation, pair_tags });
  }

  function togglePairHighlight(a: number, b: number) {
    if (highlightedPairIds?.a === a && highlightedPairIds?.b === b) onHighlightPair(null);
    else onHighlightPair({ a, b });
  }

  // ── Frame tags ────────────────────────────────────────────────────────────────

  function addFrameTag() {
    const tag = frameTagInput.trim();
    if (!tag || !annotation || annotation.frame_tags.includes(tag)) return;
    onAnnotationChange({ ...annotation, frame_tags: [...annotation.frame_tags, tag] });
    setFrameTagInput('');
  }

  function removeFrameTag(tag: string) {
    if (!annotation) return;
    onAnnotationChange({ ...annotation, frame_tags: annotation.frame_tags.filter(t => t !== tag) });
  }

  function renameFrameTag(oldTag: string, newTag: string) {
    setEditingFrameTag(null);
    const trimmed = newTag.trim();
    if (!annotation || !trimmed || trimmed === oldTag) return;
    onAnnotationChange({
      ...annotation,
      frame_tags: annotation.frame_tags.map(t => t === oldTag ? trimmed : t),
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  async function handleExport() {
    const data = await exportCoco();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'annotations_coco.json'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function SingleTagChip({ tag, bboxId }: { tag: string; bboxId: number }) {
    const editing = editingSingleTag === tag && selectedId === bboxId;
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-700 rounded text-xs font-mono">
        {editing ? (
          <input
            autoFocus
            className="bg-transparent outline-none w-20 text-xs font-mono text-zinc-100"
            value={editingSingleTagVal}
            onChange={e => setEditingSingleTagVal(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); renameSingleTag(tag, editingSingleTagVal); }
              if (e.key === 'Escape') setEditingSingleTag(null);
            }}
            onBlur={() => setEditingSingleTag(null)}
          />
        ) : (
          <span
            className="cursor-text hover:text-white"
            onDoubleClick={() => { setEditingSingleTag(tag); setEditingSingleTagVal(tag); }}
            title="Double-click to rename"
          >
            {tag}
          </span>
        )}
        {!editing && (
          <button onClick={() => removeTag(tag)} className="text-zinc-400 hover:text-red-400 leading-none ml-0.5">×</button>
        )}
      </span>
    );
  }

  return (
    <div className="w-60 flex flex-col bg-zinc-900 border-l border-zinc-700 text-sm text-zinc-100 overflow-y-auto shrink-0">

      {/* Class assignment */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Class</div>
        <div className="flex flex-col gap-1">
          {CLS_KEYS.map(({ key, cls, label }) => {
            const isActive = selected?.cls === cls;
            const color = CLS_COLOR[cls];
            return (
              <button
                key={cls}
                onClick={() => setClass(cls)}
                disabled={!selected}
                className="px-2 py-1 rounded text-xs font-mono text-left border transition-colors disabled:opacity-30"
                style={isActive
                  ? { backgroundColor: color, borderColor: color, color: '#000', fontWeight: 700 }
                  : { borderColor: '#52525b', color: '#d4d4d8' }}
              >
                <span className="opacity-50 mr-1">[{key}]</span>{label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected bbox info */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-1 uppercase tracking-wide">Selected</div>
        {selected ? (
          <>
            <div className="font-mono text-xs space-y-0.5 text-zinc-300">
              <div><span className="text-zinc-500">id: </span>#{selected.id}</div>
              <div><span className="text-zinc-500">conf: </span>{Math.round(selected.conf * 100)}%</div>
              <div><span className="text-zinc-500">size: </span>{Math.round(selected.x2 - selected.x1)}×{Math.round(selected.y2 - selected.y1)}</div>
            </div>
            <button onClick={onDeleteBbox} className="mt-2 w-full px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs text-red-200 transition-colors font-mono">
              Delete [Del]
            </button>
          </>
        ) : (
          <div className="text-xs text-zinc-600 italic">No bbox selected</div>
        )}
      </div>

      {/* Crop tags for selected bbox */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Crop Tags <span className="normal-case text-zinc-600">[Space]</span></div>
        {selected ? (
          <>
            <div className="flex flex-wrap gap-1 mb-2 min-h-4">
              {selected.single_tags.length === 0 && <span className="text-xs text-zinc-600 italic">none</span>}
              {selected.single_tags.map(tag => (
                <SingleTagChip key={tag} tag={tag} bboxId={selected.id} />
              ))}
            </div>
            <div className="flex gap-1">
              <input
                ref={tagInputRef}
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-400 font-mono"
                placeholder="add tag + Enter"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              />
              <button onClick={addTag} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors">+</button>
            </div>
          </>
        ) : (
          <div className="text-xs text-zinc-600 italic">Select a bbox first</div>
        )}
      </div>

      {/* All bboxes overview — athletes + referee only */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">All Crops</div>
        {(() => {
          const visible = (annotation?.bboxes ?? []).filter(
            b => b.cls === 'athlete_1' || b.cls === 'athlete_2' || b.cls === 'referee'
          );
          if (visible.length === 0) return <div className="text-xs text-zinc-600 italic">No athletes/ref</div>;
          return (
            <div className="flex flex-col gap-1">
              {visible.map(b => {
                const color = b.cls ? CLS_COLOR[b.cls as BboxClass] : '#f87171';
                const isSelected = b.id === selectedId;
                return (
                  <button
                    key={b.id}
                    onClick={() => onSelect(b.id)}
                    className={`text-left px-1.5 py-1 rounded text-xs font-mono transition-colors w-full ${isSelected ? 'bg-zinc-600' : 'hover:bg-zinc-800'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-zinc-400">{b.cls} #{b.id}</span>
                    </div>
                    {b.single_tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5 pl-3.5">
                        {b.single_tags.map(tag => (
                          <span key={tag} className="px-1 py-0 bg-zinc-700 rounded text-zinc-300" style={{ fontSize: 10 }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Pair tags */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Pair Tags</div>
        {pairFirstId !== null && (
          <div className="text-xs text-fuchsia-400 mb-2 font-mono">#{pairFirstId} selected — right-click 2nd bbox</div>
        )}
        {annotation?.pair_tags.length === 0 && pairFirstId === null && (
          <div className="text-xs text-zinc-600 italic">Right-click two bboxes to pair</div>
        )}
        {annotation?.pair_tags.map((pt, i) => {
          const isHighlighted = highlightedPairIds?.a === pt.a && highlightedPairIds?.b === pt.b;
          const editing = editingPairTagIdx === i;
          return (
            <div key={i} className="flex items-center justify-between mb-1 group">
              <button
                onClick={() => togglePairHighlight(pt.a, pt.b)}
                className={`text-xs font-mono text-left flex-1 rounded px-1 py-0.5 transition-colors min-w-0 ${
                  isHighlighted ? 'bg-fuchsia-900 text-fuchsia-200' : 'text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <span className="text-zinc-500">#{pt.a}↔#{pt.b} </span>
                {editing ? (
                  <input
                    autoFocus
                    className="bg-transparent outline-none text-xs font-mono text-zinc-100 w-24"
                    value={editingPairTagVal}
                    onChange={e => setEditingPairTagVal(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') { e.preventDefault(); renamePairTag(i, editingPairTagVal); }
                      if (e.key === 'Escape') setEditingPairTagIdx(null);
                    }}
                    onBlur={() => setEditingPairTagIdx(null)}
                  />
                ) : (
                  <span
                    className="cursor-text"
                    onDoubleClick={e => { e.stopPropagation(); setEditingPairTagIdx(i); setEditingPairTagVal(pt.tag); }}
                    title="Double-click to rename"
                  >
                    {pt.tag}
                  </span>
                )}
              </button>
              <button onClick={() => removePairTag(i)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs ml-1 shrink-0">×</button>
            </div>
          );
        })}
      </div>

      {/* Frame tags */}
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Frame Tags</div>
        <div className="flex flex-wrap gap-1 mb-2 min-h-4">
          {(annotation?.frame_tags ?? []).length === 0 && <span className="text-xs text-zinc-600 italic">none</span>}
          {(annotation?.frame_tags ?? []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-700 rounded text-xs font-mono">
              {editingFrameTag === tag ? (
                <input
                  autoFocus
                  className="bg-transparent outline-none w-20 text-xs font-mono text-zinc-100"
                  value={editingFrameTagVal}
                  onChange={e => setEditingFrameTagVal(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); renameFrameTag(tag, editingFrameTagVal); }
                    if (e.key === 'Escape') setEditingFrameTag(null);
                  }}
                  onBlur={() => setEditingFrameTag(null)}
                />
              ) : (
                <span
                  className="cursor-text hover:text-white"
                  onDoubleClick={() => { setEditingFrameTag(tag); setEditingFrameTagVal(tag); }}
                  title="Double-click to rename"
                >
                  {tag}
                </span>
              )}
              {editingFrameTag !== tag && (
                <button onClick={() => removeFrameTag(tag)} className="text-zinc-400 hover:text-red-400 leading-none ml-0.5">×</button>
              )}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-400 font-mono"
            placeholder="add tag + Enter"
            value={frameTagInput}
            onChange={e => setFrameTagInput(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); addFrameTag(); } }}
          />
          <button onClick={addFrameTag} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors">+</button>
        </div>
      </div>

      {/* Export */}
      <div className="p-3 shrink-0">
        <button onClick={handleExport} className="w-full px-2 py-1.5 bg-blue-900 hover:bg-blue-700 rounded text-xs text-blue-200 transition-colors font-mono">
          Export COCO JSON
        </button>
      </div>
    </div>
  );
}
