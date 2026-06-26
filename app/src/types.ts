export type BboxClass = 'athlete_1' | 'athlete_2' | 'referee' | 'crowd' | 'fighter';
export type FrameState = 'raw' | 'corrected' | 'tagged';

export interface Bbox {
  id: number;
  x1: number; y1: number; x2: number; y2: number;
  conf: number;
  cls: BboxClass | null;
  single_tags: string[];
}

export interface PairTag {
  a: number;
  b: number;
  tag: string;
}

export interface FrameAnnotation {
  frame_idx: number;
  state: FrameState;
  bboxes: Bbox[];
  pair_tags: PairTag[];
  frame_tags: string[];
}

export interface FrameMeta {
  idx: number;
  frame_number: number;
  timestamp: number;
  n_dets: number;
  state: FrameState;
}

export interface AppMeta {
  total: number;
  frame_width: number;
  frame_height: number;
  frames: FrameMeta[];
}

export type HandleType = 'TL'|'TC'|'TR'|'ML'|'MR'|'BL'|'BC'|'BR';

export const CLS_COLOR: Record<BboxClass, string> = {
  athlete_1: '#22d3ee',
  athlete_2: '#fb923c',
  referee:   '#facc15',
  crowd:     '#9ca3af',
  fighter:   '#4ade80',
};
