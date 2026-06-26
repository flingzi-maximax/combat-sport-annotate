import type { AppMeta, FrameAnnotation } from './types';

export async function fetchMeta(): Promise<AppMeta> {
  const r = await fetch('/api/meta');
  if (!r.ok) throw new Error('Failed to load meta');
  return r.json();
}

export async function fetchAnnotations(idx: number): Promise<FrameAnnotation> {
  const r = await fetch(`/api/annotations/${idx}`);
  if (!r.ok) throw new Error('Failed to load annotations');
  const data = await r.json();
  if (!data.frame_tags) data.frame_tags = [];
  return data;
}

export async function saveAnnotations(idx: number, data: FrameAnnotation): Promise<void> {
  await fetch(`/api/annotations/${idx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function frameUrl(idx: number): string {
  return `/api/frame/${idx}`;
}

export async function propagateAnnotation(sourceIdx: number, fromIdx: number, toIdx: number): Promise<{ count: number }> {
  const r = await fetch('/api/propagate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_idx: sourceIdx, from_idx: fromIdx, to_idx: toIdx }),
  });
  if (!r.ok) throw new Error('Propagation failed');
  return r.json();
}

export async function exportCoco(): Promise<object> {
  const r = await fetch('/api/export/coco');
  return r.json();
}
