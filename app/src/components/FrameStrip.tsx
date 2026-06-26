import { useRef, useEffect } from 'react';
import type { FrameMeta } from '../types';

const STATE_BG: Record<string, string> = {
  raw:       '#52525b',
  corrected: '#3b82f6',
  tagged:    '#22c55e',
};

interface Props {
  frames: FrameMeta[];
  currentIdx: number;
  bulkStart: number | null;
  bulkRange: [number, number] | null;
  onSelect: (idx: number) => void;
  onBulkSelect: (idx: number) => void;
}

export default function FrameStrip({ frames, currentIdx, bulkStart, bulkRange, onSelect, onBulkSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentIdx]);

  return (
    <div className="h-12 bg-zinc-950 border-t border-zinc-700 flex items-center gap-0.5 overflow-x-auto px-2 shrink-0">
      {frames.map(f => {
        const isActive   = f.idx === currentIdx;
        const isBulkStart = f.idx === bulkStart;
        const inBulkRange = bulkRange !== null && f.idx >= bulkRange[0] && f.idx <= bulkRange[1];

        let bg = isActive ? '#3f3f46' : undefined;
        if (inBulkRange) bg = '#451a03';
        if (isBulkStart) bg = '#78350f';

        let outline = isActive ? '1px solid #a1a1aa' : undefined;
        if (isBulkStart)  outline = '1px solid #f59e0b';
        if (inBulkRange)  outline = '1px solid #b45309';

        return (
          <button
            key={f.idx}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect(f.idx)}
            onContextMenu={e => { e.preventDefault(); onBulkSelect(f.idx); }}
            title={`#${f.idx} | frame ${f.frame_number} | ${f.timestamp.toFixed(1)}s | ${f.n_dets} dets | ${f.state}`}
            className="flex flex-col items-center justify-center rounded shrink-0 transition-colors"
            style={{ width: 28, height: 40, backgroundColor: bg, outline }}
          >
            <div
              className="rounded-full mb-0.5"
              style={{ width: 8, height: 8, backgroundColor: STATE_BG[f.state] ?? '#52525b' }}
            />
            <span className="text-zinc-600 leading-none" style={{ fontSize: 7, fontFamily: 'monospace' }}>
              {f.idx}
            </span>
          </button>
        );
      })}
    </div>
  );
}
