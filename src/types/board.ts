export type ToolType = 'select' | 'shapes' | 'fill' | 'pen' | 'highlighter' | 'eraser' | 'laser';

export type RibbonSubmenu = 'home' | 'pen' | 'eraser' | 'shapes';

export type EraserMode = 'stroke' | 'circle' | 'classic';

export type PaperPattern =
  | 'blank'
  | 'lined'
  | 'grid'
  | 'small-grid'
  | 'dots'
  | 'graph'
  | 'staff'
  | 'isometric';

export interface PageBackground {
  color: string;
  gradientColor?: string;
  imageData?: string;
  pattern: PaperPattern;
}

export interface ScreenShade {
  reveal: number;
  orientation?: 'horizontal' | 'vertical';
}

export interface PageGroup {
  id: string;
  name: string;
  collapsed: boolean;
  type?: 'pages' | 'pdf';
  sourceFile?: string;
}

export type GeometryToolKind = 'ruler' | 'protractor' | 'compass';

export interface GeometryToolState {
  kind: GeometryToolKind;
  x: number;
  y: number;
  angle: number;
  size: number;
  armAngle: number;
}

export type ShapeKind =
  | 'line'
  | 'triangle'
  | 'circle'
  | 'ellipse'
  | 'pentagon'
  | 'hexagon'
  | 'square'
  | 'octagon'
  | 'heart'
  | 'warning'
  | 'freeform'
  | 'number-line-unmetered'
  | 'number-line-metered'
  | 'number-line-metered-no-numbers'
  | 'cartesian-2d-unmetered'
  | 'cartesian-2d-metered'
  | 'cartesian-2d-metered-no-numbers'
  | 'cartesian-3d-unmetered'
  | 'cartesian-3d-metered'
  | 'cartesian-3d-metered-no-numbers';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser' | 'laser';
  color: string;
  size: number;
  points: StrokePoint[];
  pressureSensitive?: boolean;
  groupId?: string;
}

export interface BoardShape {
  id: string;
  kind: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  filled: boolean;
  fillColor?: string;
  points?: StrokePoint[];
  groupId?: string;
}

export interface BoardGraph {
  id: string;
  dimension: '2d' | '3d';
  expression: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  groupId?: string;
}

export interface BoardImage {
  id: string;
  name: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  groupId?: string;
}

export interface BoardPage {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  createdAt: string;
  width: number;
  height: number;
  background?: PageBackground;
  screenShade?: ScreenShade;
  groupId?: string;
  imageQualityScale?: number;
  strokes: Stroke[];
  shapes: BoardShape[];
  graphs: BoardGraph[];
  images?: BoardImage[];
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}