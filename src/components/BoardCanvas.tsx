import React, { useEffect, useRef, useState } from 'react';
import {
  BoardPage,
  BoardGraph,
  BoardImage,
  BoardShape,
  EraserMode,
  GeometryToolState,
  ShapeKind,
  Stroke,
  StrokePoint,
  ToolType,
  Viewport,
} from '../types/board';
import { getSvgPathFromPoints } from '../utils/strokeUtils';
import {
  getPolygonCentroid,
  isPointInPolygon,
  recognizeMagicShape,
} from '../utils/shapeRecogniser';
import { ShapeRenderer } from './ShapeRenderer';
import { GraphRenderer } from './GraphRenderer';
import { PageBackground } from './PageBackground';
import { BoardImageRenderer } from './BoardImageRenderer';

interface BoardCanvasProps {
  page: BoardPage;
  activeTool: ToolType;
  strokeColor: string;
  strokeWidth: number;
  eraserWidth: number;
  colorInverted: boolean;
  geometryTool: GeometryToolState | null;
  onGeometryToolChange: (tool: GeometryToolState | null) => void;
  pressureEnabled: boolean;
  magicInkEnabled: boolean;
  eraserMode: EraserMode;
  activeShape: ShapeKind;
  shapeFilled: boolean;
  patternVisible: boolean;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  onAddStroke: (stroke: Stroke) => void;
  onAddShape: (shape: BoardShape) => void;
  onFillShape: (shapeId: string, fillColor: string) => void;
  onEraseStroke: (strokeId: string) => void;
  onEraseShape: (shapeId: string) => void;
  onBulkErase: (strokeIds: string[], shapeIds: string[]) => void;
  onClassicErase: (
    removedStrokeIds: string[],
    replacementStrokes: Stroke[],
    shapeIds: string[]
  ) => void;
  onExtendPage: (height: number) => void;
  onUpdateScreenShade: (reveal?: number) => void;
  onDropItems: (ids: string[], targetPageId: string, copy: boolean) => void;
  onLivePreview: (stroke: Stroke | null, shape: BoardShape | null) => void;
  onUpdateGraph: (graph: BoardGraph) => void;
  onUpdateImage: (image: BoardImage) => void;
  onMoveItems: (ids: string[], dx: number, dy: number) => void;
  onGroupItems: (ids: string[], groupId: string) => void;
  onUngroupItems: (ids: string[]) => void;
  onDeleteItems: (ids: string[]) => void;
  onUpdatePageHeader: (title: string, subtitle: string) => void;
  onInteractionModeChange: (mode: 'NORMAL' | 'DRAW' | 'PAN/ZOOM') => void;
}

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  page,
  activeTool,
  strokeColor,
  strokeWidth,
  eraserWidth,
  colorInverted,
  geometryTool,
  onGeometryToolChange,
  pressureEnabled,
  magicInkEnabled,
  eraserMode,
  activeShape,
  shapeFilled,
  patternVisible,
  viewport,
  setViewport,
  onAddStroke,
  onAddShape,
  onFillShape,
  onEraseStroke,
  onEraseShape,
  onBulkErase,
  onClassicErase,
  onExtendPage,
  onUpdateScreenShade,
  onDropItems,
  onLivePreview,
  onUpdateGraph,
  onUpdateImage,
  onMoveItems,
  onGroupItems,
  onUngroupItems,
  onDeleteItems,
  onUpdatePageHeader,
  onInteractionModeChange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [draftShape, setDraftShape] = useState<BoardShape | null>(null);
  const [imageTransformDraft, setImageTransformDraft] = useState<BoardImage | null>(null);

  const [eraserLoop, setEraserLoop] = useState<{ x: number; y: number }[]>([]);
  const [pendingErasePoly, setPendingErasePoly] = useState<{ x: number; y: number }[] | null>(null);
  const [classicErasePath, setClassicErasePath] = useState<{ x: number; y: number }[]>([]);
  const [laserTrails, setLaserTrails] = useState<Stroke[]>([]);
  const [selectionLasso, setSelectionLasso] = useState<{ x: number; y: number }[]>([]);
  const [lassoBaseSelection, setLassoBaseSelection] = useState<string[]>([]);
  const [laserCursor, setLaserCursor] = useState<{ x: number; y: number } | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const [extendPromptOpen, setExtendPromptOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionDelta, setSelectionDelta] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const classicShapeIds = useRef(new Set<string>());
  const laserTrailTimeouts = useRef(new Set<number>());
  const selectionDrag = useRef<{ x: number; y: number; ids: string[] } | null>(null);
  const geometryDrag = useRef<{
    mode: 'move' | 'rotate' | 'resize' | 'measure';
    startX: number;
    startY: number;
    startTool: GeometryToolState;
    pointerAngle: number;
  } | null>(null);
  const imageTransformDrag = useRef<{
    pointerId: number;
    mode: 'rotate' | 'resize';
    startX: number;
    startY: number;
    startAngle: number;
    image: BoardImage;
  } | null>(null);
  const longPressTimeout = useRef<number | null>(null);
  const prevPinch = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const scrollbarDrag = useRef<{
    clientY: number;
    viewportY: number;
    scrollRange: number;
    thumbRange: number;
  } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => setCanvasSize({ width: svg.clientWidth, height: svg.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
    setContextMenu(null);
    setSelectionDelta(null);
    setExtendPromptOpen(false);
  }, [page.id]);

  useEffect(() => {
    onLivePreview(currentStroke, draftShape);
  }, [currentStroke, draftShape, onLivePreview]);

  useEffect(
    () => () => {
      laserTrailTimeouts.current.forEach((timeout) => window.clearTimeout(timeout));
      laserTrailTimeouts.current.clear();
    },
    []
  );

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const offsetX = rect ? clientX - rect.left : clientX;
    const offsetY = rect ? clientY - rect.top : clientY;
    return {
      x: (offsetX - viewport.x) / viewport.zoom,
      y: (offsetY - viewport.y) / viewport.zoom,
    };
  };

  const clampViewport = (next: Viewport): Viewport => {
    const minX = Math.min(0, canvasSize.width - page.width * next.zoom);
    const maxX = Math.max(0, canvasSize.width - page.width * next.zoom);
    const minY = Math.min(0, canvasSize.height - page.height * next.zoom);
    const maxY = Math.max(0, canvasSize.height - page.height * next.zoom);
    return {
      ...next,
      x: Math.max(minX, Math.min(maxX, next.x)),
      y: Math.max(minY, Math.min(maxY, next.y)),
    };
  };

  const maybeExtendPage = (worldY: number) => {
    if (worldY >= page.height - 100) setExtendPromptOpen(true);
  };

  const snapAngle = (angle: number) => {
    const normalized = ((angle % 360) + 360) % 360;
    const nearest = Math.round(normalized / 45) * 45;
    return Math.abs(normalized - nearest) < 4 ? nearest % 360 : normalized;
  };

  const snapToGeometryTool = (point: { x: number; y: number }) => {
    if (!geometryTool || (activeTool !== 'pen' && activeTool !== 'highlighter')) return point;
    const { kind, x, y, angle, size, armAngle } = geometryTool;
    const radians = (angle * Math.PI) / 180;
    const rotateToWorld = (localX: number, localY: number, centerX: number, centerY: number) => ({
      x: centerX + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: centerY + localX * Math.sin(radians) + localY * Math.cos(radians),
    });

    if (kind === 'ruler') {
      const centerX = x + size / 2;
      const centerY = y + 20;
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
      const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
      if (Math.abs(localY - 12) <= 18 && Math.abs(localX) <= size / 2) {
        return rotateToWorld(localX, 12, centerX, centerY);
      }
    } else if (kind === 'protractor') {
      const dx = point.x - x;
      const dy = point.y - y;
      const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
      const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
      const arm = (-armAngle * Math.PI) / 180;
      const endpoint = { x: size * Math.cos(arm), y: size * Math.sin(arm) };
      const lengthSquared = endpoint.x ** 2 + endpoint.y ** 2;
      const t = Math.max(0, Math.min(1, (localX * endpoint.x + localY * endpoint.y) / lengthSquared));
      const projected = { x: endpoint.x * t, y: endpoint.y * t };
      if (Math.hypot(localX - projected.x, localY - projected.y) <= 18) {
        return rotateToWorld(projected.x, projected.y, x, y);
      }
    } else {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (Math.abs(distance - size) <= 18) {
        const direction = Math.atan2(point.y - y, point.x - x);
        return { x: x + size * Math.cos(direction), y: y + size * Math.sin(direction) };
      }
    }
    return point;
  };

  const allItems = [...page.strokes, ...page.shapes, ...page.graphs, ...(page.images ?? [])];
  const idsForItem = (id: string) => {
    const item = allItems.find((candidate) => candidate.id === id);
    if (!item?.groupId) return [id];
    return allItems.filter((candidate) => candidate.groupId === item.groupId).map((candidate) => candidate.id);
  };

  const itemIdAt = (clientX: number, clientY: number) => {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest('[data-stroke-id], [data-shape-id], [data-graph-id], [data-image-id]');
    if (!target) return null;
    return (
      target.getAttribute('data-stroke-id') ??
      target.getAttribute('data-shape-id') ??
      target.getAttribute('data-graph-id') ??
      target.getAttribute('data-image-id')
    );
  };

  const openSelectionMenu = (clientX: number, clientY: number, ids: string[]) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || ids.length === 0) return;
    selectionDrag.current = null;
    setSelectionDelta(null);
    setSelectedIds(ids);
    setContextMenu({
      x: Math.max(4, Math.min(clientX - rect.left, rect.width - 164)),
      y: Math.max(4, Math.min(clientY - rect.top, rect.height - 120)),
      ids,
    });
  };

  const selectedSet = new Set(selectedIds);
  const selectedPoints = [
    ...page.strokes
      .filter((stroke) => selectedSet.has(stroke.id))
      .flatMap((stroke) => stroke.points.map(({ x, y }) => ({ x, y }))),
    ...page.shapes
      .filter((shape) => selectedSet.has(shape.id))
      .flatMap((shape) => [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }]),
    ...page.graphs
      .filter((graph) => selectedSet.has(graph.id))
      .flatMap((graph) => [
        { x: graph.x, y: graph.y },
        { x: graph.x + graph.width, y: graph.y + graph.height },
      ]),
    ...(page.images ?? []).filter((image) => selectedSet.has(image.id)).flatMap((image) => {
      const angle = (image.rotation * Math.PI) / 180;
      const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
      return [
        { x: image.x, y: image.y },
        { x: image.x + image.width, y: image.y },
        { x: image.x, y: image.y + image.height },
        { x: image.x + image.width, y: image.y + image.height },
      ].map((point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        return {
          x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
          y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
        };
      });
    }),
  ];
  const selectionBounds = selectedPoints.reduce<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>((bounds, point) => ({
    minX: Math.min(bounds?.minX ?? point.x, point.x),
    minY: Math.min(bounds?.minY ?? point.y, point.y),
    maxX: Math.max(bounds?.maxX ?? point.x, point.x),
    maxY: Math.max(bounds?.maxY ?? point.y, point.y),
  }), null);
  const selectionRect = selectionBounds
    ? {
        x: selectionBounds.minX - 8,
        y: selectionBounds.minY - 8,
        width: selectionBounds.maxX - selectionBounds.minX + 16,
        height: selectionBounds.maxY - selectionBounds.minY + 16,
      }
    : null;

  const handleContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    const itemId = itemIdAt(event.clientX, event.clientY);
    const ids = itemId
      ? selectedIds.includes(itemId) ? selectedIds : idsForItem(itemId)
      : selectedIds;
    openSelectionMenu(event.clientX, event.clientY, ids);
  };

  const contextItems = contextMenu
    ? allItems.filter((item) => contextMenu.ids.includes(item.id))
    : [];
  const contextGroups = new Set(contextItems.map((item) => item.groupId).filter(Boolean));
  const contextIsOneGroup =
    contextItems.length > 0 &&
    contextItems.every((item) => Boolean(item.groupId)) &&
    contextGroups.size === 1;

  const executePolygonErase = (polygon: { x: number; y: number }[]) => {
    const strokeIds = page.strokes
      .filter((s) => s.points.some((pt) => isPointInPolygon(pt.x, pt.y, polygon)))
      .map((s) => s.id);

    const shapeIds = page.shapes
      .filter((sh) => {
        const cx = (sh.x1 + sh.x2) / 2;
        const cy = (sh.y1 + sh.y2) / 2;
        return (
          isPointInPolygon(cx, cy, polygon) ||
          isPointInPolygon(sh.x1, sh.y1, polygon) ||
          isPointInPolygon(sh.x2, sh.y2, polygon)
        );
      })
      .map((sh) => sh.id);

    if (strokeIds.length > 0 || shapeIds.length > 0) {
      onBulkErase(strokeIds, shapeIds);
    }
    setPendingErasePoly(null);
  };

  const segmentIntersectsPolygon = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    polygon: { x: number; y: number }[],
  ) => {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const samples = Math.max(1, Math.ceil(length / 12));
    for (let index = 0; index <= samples; index++) {
      const ratio = index / samples;
      const x = start.x + (end.x - start.x) * ratio;
      const y = start.y + (end.y - start.y) * ratio;
      if (isPointInPolygon(x, y, polygon)) return true;
    }
    return false;
  };

  const strokeIntersectsLasso = (stroke: Stroke, polygon: { x: number; y: number }[]) => {
    if (stroke.points.some((point) => isPointInPolygon(point.x, point.y, polygon))) return true;
    return stroke.points.some((point, index) =>
      index > 0 && segmentIntersectsPolygon(stroke.points[index - 1], point, polygon)
    );
  };

  const imageIntersectsLasso = (image: BoardImage, polygon: { x: number; y: number }[]) => {
    const angle = (image.rotation * Math.PI) / 180;
    const centerX = image.x + image.width / 2;
    const centerY = image.y + image.height / 2;
    const corners = [
      { x: image.x, y: image.y },
      { x: image.x + image.width, y: image.y },
      { x: image.x + image.width, y: image.y + image.height },
      { x: image.x, y: image.y + image.height },
    ].map((point) => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      return {
        x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
    });
    if (corners.some((point) => isPointInPolygon(point.x, point.y, polygon))) return true;
    for (let index = 0; index < corners.length; index++) {
      if (segmentIntersectsPolygon(corners[index], corners[(index + 1) % corners.length], polygon)) return true;
    }
    return polygon.some((point) => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const localX = centerX + dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = centerY - dx * Math.sin(angle) + dy * Math.cos(angle);
      return localX >= image.x && localX <= image.x + image.width &&
        localY >= image.y && localY <= image.y + image.height;
    });
  };

  const getClassicEraseResult = (erasePath: { x: number; y: number }[]) => {
    const radius = (eraserWidth / 2) / viewport.zoom;
    const removedStrokeIds: string[] = [];
    const replacementStrokes: Stroke[] = [];

    for (const stroke of page.strokes) {
      const samples: StrokePoint[] = [];
      if (stroke.points.length === 1) {
        samples.push(stroke.points[0]);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const start = stroke.points[i - 1];
          const end = stroke.points[i];
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          const count = Math.max(1, Math.ceil(length / (radius / 2)));
          if (i === 1) samples.push(start);
          for (let step = 1; step <= count; step++) {
            const t = step / count;
            samples.push({
              x: start.x + (end.x - start.x) * t,
              y: start.y + (end.y - start.y) * t,
              pressure: start.pressure + (end.pressure - start.pressure) * t,
            });
          }
        }
      }

      let touched = false;
      let run: StrokePoint[] = [];
      const remainingRuns: StrokePoint[][] = [];
      for (const sample of samples) {
        let isErased = false;
        if (erasePath.length === 1) {
          isErased =
            Math.hypot(sample.x - erasePath[0].x, sample.y - erasePath[0].y) <= radius;
        } else {
          for (let i = 1; i < erasePath.length; i++) {
            const start = erasePath[i - 1];
            const end = erasePath[i];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            const t =
              lengthSquared === 0
                ? 0
                : Math.max(
                    0,
                    Math.min(1, ((sample.x - start.x) * dx + (sample.y - start.y) * dy) / lengthSquared)
                  );
            if (Math.hypot(sample.x - (start.x + t * dx), sample.y - (start.y + t * dy)) <= radius) {
              isErased = true;
              break;
            }
          }
        }

        if (isErased) {
          touched = true;
          if (run.length > 0) remainingRuns.push(run);
          run = [];
        } else {
          run.push(sample);
        }
      }
      if (run.length > 0) remainingRuns.push(run);

      if (touched) {
        removedStrokeIds.push(stroke.id);
        remainingRuns.forEach((points) => {
          replacementStrokes.push({
            ...stroke,
            id: crypto.randomUUID(),
            points,
          });
        });
      }
    }

    return { removedStrokeIds, replacementStrokes };
  };

  const collectClassicShape = (clientX: number, clientY: number) => {
    const shapeId = document
      .elementFromPoint(clientX, clientY)
      ?.closest('[data-shape-id]')
      ?.getAttribute('data-shape-id');
    if (shapeId) classicShapeIds.current.add(shapeId);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const imageAction = (e.target as Element).closest<SVGElement>('[data-image-action]');
    if (activeTool === 'select' && imageAction) {
      const imageId = imageAction.getAttribute('data-image-action-id');
      const image = page.images?.find((item) => item.id === imageId);
      const mode = imageAction.getAttribute('data-image-action');
      if (image && (mode === 'rotate' || mode === 'resize')) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const point = screenToWorld(e.clientX, e.clientY);
        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        imageTransformDrag.current = {
          pointerId: e.pointerId,
          mode,
          startX: point.x,
          startY: point.y,
          startAngle: Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI),
          image,
        };
        setSelectedIds(idsForItem(image.id));
        setImageTransformDraft(image);
        return;
      }
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger gesture activated (Pinch-to-Zoom + Pan)
    if (activePointers.current.size === 2) {
      setCurrentStroke(null);
      setDraftShape(null);
      setEraserLoop([]);
      setClassicErasePath([]);
      classicShapeIds.current.clear();
      selectionDrag.current = null;
      setSelectionDelta(null);
      if (longPressTimeout.current !== null) {
        window.clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
      onInteractionModeChange('PAN/ZOOM');
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      prevPinch.current = { dist, midX, midY };
      return;
    }

    if (activePointers.current.size === 1) {
      const rawWorldPt = screenToWorld(e.clientX, e.clientY);
      const worldPt = snapToGeometryTool(rawWorldPt);
      const pressure = pressureEnabled && e.pressure > 0 ? e.pressure : 0.5;

      if (activeTool === 'fill') {
        const targetShapeId = (e.target as Element)
          .closest<SVGElement>('[data-shape-id]')
          ?.getAttribute('data-shape-id');
        if (targetShapeId) {
          onFillShape(targetShapeId, strokeColor);
          return;
        }

        const closedStroke = [...page.strokes].reverse().find((stroke) => {
          if (stroke.points.length < 3) return false;
          const first = stroke.points[0];
          const last = stroke.points[stroke.points.length - 1];
          return Math.hypot(first.x - last.x, first.y - last.y) <= Math.max(24, stroke.size * 3) &&
            isPointInPolygon(worldPt.x, worldPt.y, stroke.points);
        });
        if (closedStroke) {
          const bounds = closedStroke.points.reduce((result, point) => ({
            minX: Math.min(result.minX, point.x),
            minY: Math.min(result.minY, point.y),
            maxX: Math.max(result.maxX, point.x),
            maxY: Math.max(result.maxY, point.y),
          }), {
            minX: Number.POSITIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY,
          });
          onAddShape({
            id: crypto.randomUUID(),
            kind: 'freeform',
            x1: bounds.minX,
            y1: bounds.minY,
            x2: bounds.maxX,
            y2: bounds.maxY,
            color: closedStroke.color,
            fillColor: strokeColor,
            strokeWidth: closedStroke.size,
            filled: true,
            points: closedStroke.points,
          });
        }
        return;
      }

      if (activeTool === 'select') {
        setContextMenu(null);
        const itemId = itemIdAt(e.clientX, e.clientY);
        if (!itemId) {
          const baseSelection = e.shiftKey || e.ctrlKey || e.metaKey ? selectedIds : [];
          setLassoBaseSelection(baseSelection);
          setSelectionLasso([worldPt]);
          if (baseSelection.length === 0) setSelectedIds([]);
          return;
        }

        const itemIds = idsForItem(itemId);
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          setSelectedIds((previous) =>
            itemIds.every((id) => previous.includes(id))
              ? previous.filter((id) => !itemIds.includes(id))
              : [...new Set([...previous, ...itemIds])]
          );
          return;
        }

        const dragIds = selectedIds.includes(itemId) ? selectedIds : itemIds;
        if (!selectedIds.includes(itemId)) setSelectedIds(itemIds);
        selectionDrag.current = { x: worldPt.x, y: worldPt.y, ids: dragIds };
        setSelectionDelta({ x: 0, y: 0 });
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          longPressTimeout.current = window.setTimeout(
            () => {
              longPressTimeout.current = null;
              openSelectionMenu(e.clientX, e.clientY, dragIds);
            },
            550
          );
        }
        return;
      }

      if (activeTool === 'eraser' && eraserMode === 'classic') {
        classicShapeIds.current.clear();
        collectClassicShape(e.clientX, e.clientY);
        setClassicErasePath([{ x: worldPt.x, y: worldPt.y }]);
        onInteractionModeChange('DRAW');
        return;
      }

      // Circle-to-Erase
      if (activeTool === 'eraser' && eraserMode === 'circle') {
        if (pendingErasePoly && isPointInPolygon(worldPt.x, worldPt.y, pendingErasePoly)) {
          executePolygonErase(pendingErasePoly);
          return;
        }
        setPendingErasePoly(null);
        setEraserLoop([{ x: worldPt.x, y: worldPt.y }]);
        onInteractionModeChange('DRAW');
        return;
      }

      // Shapes Tool
      if (activeTool === 'shapes') {
        onInteractionModeChange('DRAW');
        setDraftShape({
          id: crypto.randomUUID(),
          kind: activeShape,
          x1: worldPt.x,
          y1: worldPt.y,
          x2: worldPt.x,
          y2: worldPt.y,
          color: strokeColor,
          strokeWidth,
          filled: shapeFilled,
        });
        return;
      }

      // Pen, Highlighter, or Laser Tool
      if (activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'laser') {
        onInteractionModeChange('DRAW');
        const effectiveSize =
          activeTool === 'highlighter'
            ? Math.max(strokeWidth * 3, 14)
            : activeTool === 'laser'
              ? 8
              : strokeWidth;

        setCurrentStroke({
          id: crypto.randomUUID(),
          tool: activeTool,
          color: activeTool === 'laser' ? '#ff4d4f' : strokeColor,
          size: effectiveSize,
          points: [{ x: worldPt.x, y: worldPt.y, pressure }],
          pressureSensitive: activeTool !== 'laser' && pressureEnabled,
        });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const imageDrag = imageTransformDrag.current;
    if (imageDrag?.pointerId === e.pointerId) {
      const point = screenToWorld(e.clientX, e.clientY);
      const image = imageDrag.image;
      const centerX = image.x + image.width / 2;
      const centerY = image.y + image.height / 2;
      if (imageDrag.mode === 'rotate') {
        const angle = Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI);
        setImageTransformDraft({
          ...image,
          rotation: image.rotation + angle - imageDrag.startAngle,
        });
      } else {
        const radians = (image.rotation * Math.PI) / 180;
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        const localX = centerX + dx * Math.cos(radians) + dy * Math.sin(radians);
        const localY = centerY - dx * Math.sin(radians) + dy * Math.cos(radians);
        const width = Math.max(32, localX - image.x);
        const height = Math.max(32, localY - image.y);
        const scale = Math.max(width / image.width, height / image.height);
        setImageTransformDraft({
          ...image,
          width: image.width * scale,
          height: image.height * scale,
        });
      }
      return;
    }
    if (activeTool === 'laser') {
      const point = screenToWorld(e.clientX, e.clientY);
      setLaserCursor(point);
    } else if (activeTool === 'eraser' && eraserMode === 'classic') {
      setEraserCursor(screenToWorld(e.clientX, e.clientY));
    }
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2-finger Pinch-to-Zoom & Pan
    if (activePointers.current.size === 2 && prevPinch.current) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;

      const scaleFactor = dist / prevPinch.current.dist;
      const dx = midX - prevPinch.current.midX;
      const dy = midY - prevPinch.current.midY;

      const rect = svgRef.current?.getBoundingClientRect();
      const localMidX = rect ? midX - rect.left : midX;
      const localMidY = rect ? midY - rect.top : midY;

      const nextZoom = Math.min(Math.max(viewport.zoom * scaleFactor, 0.25), 4);
      const actualScale = nextZoom / viewport.zoom;
      const next = clampViewport({
        zoom: nextZoom,
        x: localMidX - (localMidX - viewport.x) * actualScale + dx,
        y: localMidY - (localMidY - viewport.y) * actualScale + dy,
      });
      setViewport(next);
      if ((canvasSize.height - next.y) / next.zoom >= page.height - 100) {
        setExtendPromptOpen(true);
      }

      prevPinch.current = { dist, midX, midY };
      return;
    }

    if (activePointers.current.size === 1) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      maybeExtendPage(worldPt.y);

      if (activeTool === 'select' && selectionLasso.length > 0) {
        setSelectionLasso((points) => [...points, worldPt]);
        return;
      }

      if (activeTool === 'select' && selectionDrag.current) {
        const dx = worldPt.x - selectionDrag.current.x;
        const dy = worldPt.y - selectionDrag.current.y;
        setSelectionDelta({ x: dx, y: dy });
        if (Math.hypot(dx, dy) > 8 && longPressTimeout.current !== null) {
          window.clearTimeout(longPressTimeout.current);
          longPressTimeout.current = null;
        }
        return;
      }

      if (activeTool === 'eraser' && eraserMode === 'classic' && classicErasePath.length > 0) {
        const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        const samples = coalesced.map((sample) => {
          collectClassicShape(sample.clientX, sample.clientY);
          return screenToWorld(sample.clientX, sample.clientY);
        });
        setClassicErasePath((prev) => [...prev, ...samples]);
        return;
      }

      if (activeTool === 'eraser' && eraserMode === 'circle' && eraserLoop.length > 0) {
        setEraserLoop((prev) => [...prev, { x: worldPt.x, y: worldPt.y }]);
        return;
      }

      if (draftShape) {
        setDraftShape((prev) => (prev ? { ...prev, x2: worldPt.x, y2: worldPt.y } : null));
        return;
      }

      if (currentStroke) {
        const pressure = pressureEnabled && e.pressure > 0 ? e.pressure : 0.5;
        const snapped = snapToGeometryTool(worldPt);
        const nextPoint: StrokePoint = { x: snapped.x, y: snapped.y, pressure };
        setCurrentStroke((prev) =>
          prev ? { ...prev, points: [...prev.points, nextPoint] } : null
        );
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const imageDrag = imageTransformDrag.current;
    if (imageDrag?.pointerId === e.pointerId) {
      if (imageTransformDraft) onUpdateImage(imageTransformDraft);
      imageTransformDrag.current = null;
      setImageTransformDraft(null);
      onInteractionModeChange('NORMAL');
      return;
    }
    activePointers.current.delete(e.pointerId);

    if (activePointers.current.size < 2) {
      prevPinch.current = null;
    }

    if (activePointers.current.size === 0) {
      onInteractionModeChange('NORMAL');

      if (selectionDrag.current) {
        if (longPressTimeout.current !== null) {
          window.clearTimeout(longPressTimeout.current);
          longPressTimeout.current = null;
        }
        const drag = selectionDrag.current;
        const pageTarget = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-page-drop-target]')
          ?.dataset.pageDropTarget;
        if (pageTarget && pageTarget !== page.id) {
          onDropItems(drag.ids, pageTarget, e.ctrlKey || e.altKey);
          selectionDrag.current = null;
          setSelectionDelta(null);
          return;
        }
        const point = screenToWorld(e.clientX, e.clientY);
        const dx = point.x - drag.x;
        const dy = point.y - drag.y;
        if (Math.hypot(dx, dy) > 1) onMoveItems(drag.ids, dx, dy);
        selectionDrag.current = null;
        setSelectionDelta(null);
        return;
      }

      if (selectionLasso.length > 2) {
        const strokeIds = page.strokes.filter((stroke) => strokeIntersectsLasso(stroke, selectionLasso)).map((stroke) => stroke.id);
        const shapeIds = page.shapes.filter((shape) => {
          const minX = Math.min(shape.x1, shape.x2);
          const maxX = Math.max(shape.x1, shape.x2);
          const minY = Math.min(shape.y1, shape.y2);
          const maxY = Math.max(shape.y1, shape.y2);
          const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: minX, y: maxY },
            { x: maxX, y: maxY },
          ];
          return corners.some((point) => isPointInPolygon(point.x, point.y, selectionLasso)) ||
            selectionLasso.some((point) =>
              point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
            ) ||
            segmentIntersectsPolygon(
              { x: shape.x1, y: shape.y1 },
              { x: shape.x2, y: shape.y2 },
              selectionLasso,
            );
        }).map((shape) => shape.id);
        const graphIds = page.graphs.filter((graph) => {
          const corners = [
            { x: graph.x, y: graph.y },
            { x: graph.x + graph.width, y: graph.y },
            { x: graph.x, y: graph.y + graph.height },
            { x: graph.x + graph.width, y: graph.y + graph.height },
          ];
          return corners.some((point) => isPointInPolygon(point.x, point.y, selectionLasso)) ||
            selectionLasso.some((point) =>
              point.x >= graph.x && point.x <= graph.x + graph.width &&
              point.y >= graph.y && point.y <= graph.y + graph.height
            );
        }).map((graph) => graph.id);
        const imageIds = (page.images ?? [])
          .filter((image) => imageIntersectsLasso(image, selectionLasso))
          .map((image) => image.id);
        const lassoIds = [...new Set([...lassoBaseSelection, ...strokeIds, ...shapeIds, ...graphIds, ...imageIds])];
        setSelectedIds([...new Set(lassoIds.flatMap((id) => idsForItem(id)))]);
        setSelectionLasso([]);
        setLassoBaseSelection([]);
        return;
      }
      if (selectionLasso.length > 0) {
        setSelectionLasso([]);
        setLassoBaseSelection([]);
      }

      if (activeTool === 'eraser' && eraserMode === 'classic' && classicErasePath.length > 0) {
        const { removedStrokeIds, replacementStrokes } = getClassicEraseResult(classicErasePath);
        onClassicErase(removedStrokeIds, replacementStrokes, [...classicShapeIds.current]);
        classicShapeIds.current.clear();
        setClassicErasePath([]);
        return;
      }

      if (eraserLoop.length > 4) {
        setPendingErasePoly(eraserLoop);
        setEraserLoop([]);
        return;
      }
      setEraserLoop([]);

      if (draftShape) {
        if (Math.hypot(draftShape.x2 - draftShape.x1, draftShape.y2 - draftShape.y1) > 8) {
          onAddShape(draftShape);
        }
        setDraftShape(null);
        return;
      }

      if (currentStroke && currentStroke.points.length > 0) {
        if (currentStroke.tool === 'laser') {
          const trailId = currentStroke.id;
          setLaserTrails((prev) => [...prev, currentStroke]);
          const timeout = window.setTimeout(() => {
            setLaserTrails((prev) => prev.filter((trail) => trail.id !== trailId));
            laserTrailTimeouts.current.delete(timeout);
          }, 1700);
          laserTrailTimeouts.current.add(timeout);
        } else if (currentStroke.tool === 'pen' || currentStroke.tool === 'highlighter') {
          if (magicInkEnabled && currentStroke.tool === 'pen') {
            const recognized = recognizeMagicShape(
              currentStroke.points,
              currentStroke.color,
              currentStroke.size
            );
            if (recognized) {
              onAddShape(recognized);
              setCurrentStroke(null);
              return;
            }
          }
          onAddStroke(currentStroke);
        }
        setCurrentStroke(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = svgRef.current?.getBoundingClientRect();
      const cursorX = rect ? e.clientX - rect.left : e.clientX;
      const cursorY = rect ? e.clientY - rect.top : e.clientY;
      const nextZoom = Math.min(Math.max(viewport.zoom * Math.exp(-e.deltaY * 0.01), 0.25), 4);
      const scale = nextZoom / viewport.zoom;
      setViewport(clampViewport({
        zoom: nextZoom,
        x: cursorX - (cursorX - viewport.x) * scale,
        y: cursorY - (cursorY - viewport.y) * scale,
      }));
    } else {
      const next = clampViewport({
        ...viewport,
        x: viewport.x - e.deltaX,
        y: viewport.y - e.deltaY,
      });
      setViewport(next);
      if ((canvasSize.height - next.y) / next.zoom >= page.height - 100) {
        setExtendPromptOpen(true);
      }
    }
  };

  const pendingCenter = pendingErasePoly ? getPolygonCentroid(pendingErasePoly) : null;
  const shadeVertical = page.screenShade?.orientation === 'vertical';
  const contentHeight = page.height * viewport.zoom;
  const scrollRange = Math.max(0, contentHeight - canvasSize.height);
  const thumbHeight = contentHeight > 0
    ? Math.min(canvasSize.height, Math.max(32, canvasSize.height * canvasSize.height / contentHeight))
    : canvasSize.height;
  const thumbRange = Math.max(0, canvasSize.height - thumbHeight);
  const thumbTop = scrollRange > 0 ? Math.min(thumbRange, (-viewport.y / scrollRange) * thumbRange) : 0;

  const handleScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const clickedThumb = (event.target as Element).closest('.canvas-scroll-thumb') !== null;
    let startViewportY = viewport.y;
    if (!clickedThumb && thumbRange > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      const thumbOffset = Math.max(0, Math.min(thumbRange, event.clientY - rect.top - thumbHeight / 2));
      startViewportY = -(thumbOffset / thumbRange) * scrollRange;
      setViewport({ ...viewport, y: startViewportY });
    }
    scrollbarDrag.current = {
      clientY: event.clientY,
      viewportY: startViewportY,
      scrollRange,
      thumbRange,
    };
  };

  const handleScrollbarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scrollbarDrag.current;
    if (!drag || drag.thumbRange <= 0) return;
    const delta = event.clientY - drag.clientY;
    const y = drag.viewportY - delta * (drag.scrollRange / drag.thumbRange);
    const next = clampViewport({ ...viewport, y });
    setViewport(next);
    if ((canvasSize.height - next.y) / next.zoom >= page.height - 100) {
      setExtendPromptOpen(true);
    }
  };

  const clampGeometryPosition = (tool: GeometryToolState, x: number, y: number) => {
    if (tool.kind === 'ruler') {
      const radians = (tool.angle * Math.PI) / 180;
      const halfWidth = Math.abs(Math.cos(radians)) * tool.size / 2 + Math.abs(Math.sin(radians)) * 20 + 16;
      const halfHeight = Math.abs(Math.sin(radians)) * tool.size / 2 + Math.abs(Math.cos(radians)) * 20 + 16;
      const centerX = Math.max(halfWidth, Math.min(page.width - halfWidth, x + tool.size / 2));
      const centerY = Math.max(halfHeight, Math.min(page.height - halfHeight, y + 20));
      return { x: centerX - tool.size / 2, y: centerY - 20 };
    }
    const radius = tool.size + 16;
    return {
      x: Math.max(radius, Math.min(page.width - radius, x)),
      y: Math.max(radius, Math.min(page.height - radius, y)),
    };
  };

  const handleGeometryPointerDown = (event: React.PointerEvent<SVGGElement>) => {
    const target = event.target as SVGElement;
    const action = target.getAttribute('data-instrument-action');
    const compassTipDraw = geometryTool?.kind === 'compass' && action === 'resize';
    if (activeTool !== 'select' && action !== 'rotate' && (action !== 'resize' || compassTipDraw)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!geometryTool) return;
    const point = screenToWorld(event.clientX, event.clientY);
    const center = geometryTool.kind === 'ruler'
      ? { x: geometryTool.x + geometryTool.size / 2, y: geometryTool.y + 20 }
      : { x: geometryTool.x, y: geometryTool.y };
    const mode = action === 'rotate'
      ? 'rotate'
      : action === 'resize'
        ? 'resize'
        : action === 'measure'
          ? 'measure'
          : 'move';
    geometryDrag.current = {
      mode,
      startX: point.x,
      startY: point.y,
      startTool: { ...geometryTool },
      pointerAngle: Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI),
    };
  };

  const handleGeometryPointerMove = (event: React.PointerEvent<SVGGElement>) => {
    const drag = geometryDrag.current;
    if (!drag) return;
    const point = screenToWorld(event.clientX, event.clientY);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const original = drag.startTool;
    if (drag.mode === 'move') {
      const position = clampGeometryPosition(original, original.x + dx, original.y + dy);
      onGeometryToolChange({ ...original, ...position });
    } else if (drag.mode === 'rotate') {
      const center = original.kind === 'ruler'
        ? { x: original.x + original.size / 2, y: original.y + 20 }
        : { x: original.x, y: original.y };
      const currentAngle = Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
      if (original.kind === 'compass') {
        onGeometryToolChange({ ...original, armAngle: snapAngle(currentAngle) });
      } else {
        const rotated = {
          ...original,
          angle: snapAngle(original.angle + currentAngle - drag.pointerAngle),
        };
        onGeometryToolChange({ ...rotated, ...clampGeometryPosition(rotated, rotated.x, rotated.y) });
      }
    } else if (drag.mode === 'resize') {
      if (original.kind === 'ruler') {
        const radians = (original.angle * Math.PI) / 180;
        const centerX = original.x + original.size / 2;
        const centerY = original.y + 20;
        const localX = (point.x - centerX) * Math.cos(radians) + (point.y - centerY) * Math.sin(radians);
        const size = Math.max(160, Math.min(900, Math.abs(localX) * 2));
        const resized = { ...original, size, x: centerX - size / 2 };
        onGeometryToolChange({ ...resized, ...clampGeometryPosition(resized, resized.x, resized.y) });
      } else {
        const resized = {
          ...original,
          size: Math.max(70, Math.min(420, Math.hypot(point.x - original.x, point.y - original.y))),
        };
        onGeometryToolChange({ ...resized, ...clampGeometryPosition(resized, resized.x, resized.y) });
      }
    } else if (drag.mode === 'measure' && original.kind === 'protractor') {
      const radians = (original.angle * Math.PI) / 180;
      const localX = (point.x - original.x) * Math.cos(radians) + (point.y - original.y) * Math.sin(radians);
      const localY = -(point.x - original.x) * Math.sin(radians) + (point.y - original.y) * Math.cos(radians);
      const angle = Math.atan2(-localY, localX) * (180 / Math.PI);
      onGeometryToolChange({ ...original, armAngle: Math.max(0, Math.min(180, angle)) });
    }
  };

  const handleGeometryWheel = (event: React.WheelEvent<SVGGElement>) => {
    if (!geometryTool) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.deltaY < 0 ? 5 : -5;
    if (geometryTool.kind === 'compass') {
      onGeometryToolChange({ ...geometryTool, armAngle: snapAngle(geometryTool.armAngle + step) });
    } else {
      onGeometryToolChange({ ...geometryTool, angle: snapAngle(geometryTool.angle + step) });
    }
  };

  const renderGeometryTool = () => {
    if (!geometryTool) return null;
    const tool = geometryTool;
    const instrumentProps = {
      onPointerDown: handleGeometryPointerDown,
      onPointerMove: handleGeometryPointerMove,
      onPointerUp: () => { geometryDrag.current = null; },
      onPointerCancel: () => { geometryDrag.current = null; },
      onWheel: handleGeometryWheel,
      style: { cursor: activeTool === 'select' ? 'grab' : 'crosshair' },
    };
    const handle = (cx: number, cy: number, action: string) => (
      <>
        <circle
          cx={cx}
          cy={cy}
          r={16}
          fill="transparent"
          className="instrument-hit-area"
          data-instrument-action={action}
        />
        <circle cx={cx} cy={cy} r={8} className="instrument-handle" pointerEvents="none" />
      </>
    );

    if (tool.kind === 'ruler') {
      const tickCount = Math.floor(tool.size / 10);
      return (
        <g
          {...instrumentProps}
          className="board-instrument ruler-instrument"
          transform={`translate(${tool.x} ${tool.y}) rotate(${tool.angle} ${tool.size / 2} 20)`}
        >
          <rect x={0} y={0} width={tool.size} height={40} rx={5} className="instrument-body" />
          {Array.from({ length: tickCount + 1 }, (_, index) => {
            const major = index % 5 === 0;
            return (
              <g key={index} pointerEvents="none">
                <line x1={index * 10} y1={0} x2={index * 10} y2={major ? 15 : 8} className="instrument-tick" />
                {major && <text x={index * 10 + 2} y={29} className="instrument-label">{index}</text>}
              </g>
            );
          })}
          <text x={tool.size / 2} y={-7} textAnchor="middle" className="instrument-readout">
            {Math.round(tool.angle)}°
          </text>
          {handle(tool.size / 2, -16, 'rotate')}
          {handle(tool.size, 20, 'resize')}
          <rect x={0} y={28} width={tool.size} height={5} className="ruler-snap-edge" pointerEvents="none" />
        </g>
      );
    }

    if (tool.kind === 'protractor') {
      const radius = tool.size;
      const arcPoints = Array.from({ length: 37 }, (_, index) => {
        const radians = (index * 5 * Math.PI) / 180;
        return { x: radius * Math.cos(radians), y: -radius * Math.sin(radians) };
      });
      const arcPath = arcPoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
      const armRadians = (-tool.armAngle * Math.PI) / 180;
      return (
        <g
          {...instrumentProps}
          className="board-instrument protractor-instrument"
          transform={`translate(${tool.x} ${tool.y}) rotate(${tool.angle})`}
        >
          <path d={`${arcPath} L${-radius},0 Z`} className="instrument-body" />
          {Array.from({ length: 37 }, (_, index) => {
            const degrees = index * 5;
            const radians = (degrees * Math.PI) / 180;
            const major = degrees % 10 === 0;
            const inner = radius - (major ? 18 : 9);
            return (
              <g key={degrees} pointerEvents="none">
                <line
                  x1={radius * Math.cos(radians)}
                  y1={-radius * Math.sin(radians)}
                  x2={inner * Math.cos(radians)}
                  y2={-inner * Math.sin(radians)}
                  className="instrument-tick"
                />
                {major && (
                  <text
                    x={(radius - 30) * Math.cos(radians)}
                    y={-(radius - 30) * Math.sin(radians) + 4}
                    className="instrument-label"
                    textAnchor="middle"
                  >
                    {degrees}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={0} y1={0} x2={radius * Math.cos(armRadians)} y2={radius * Math.sin(armRadians)} className="protractor-arm" pointerEvents="none" />
          <text x={0} y={24} textAnchor="middle" className="instrument-readout">{Math.round(tool.armAngle)}°</text>
          {handle(0, -radius - 12, 'rotate')}
          {handle(radius, 0, 'resize')}
          <circle cx={radius * Math.cos(armRadians)} cy={radius * Math.sin(armRadians)} r={7} className="instrument-measure-handle" data-instrument-action="measure" />
        </g>
      );
    }

    const arm = (tool.armAngle * Math.PI) / 180;
    const tip = { x: tool.size * Math.cos(arm), y: tool.size * Math.sin(arm) };
    const otherTip = { x: tool.size * Math.cos(arm + 0.32), y: tool.size * Math.sin(arm + 0.32) };
    return (
      <g
        {...instrumentProps}
        className="board-instrument compass-instrument"
        transform={`translate(${tool.x} ${tool.y})`}
      >
        <circle cx={0} cy={0} r={tool.size} className="compass-pan-hit-area" />
        <circle cx={0} cy={0} r={tool.size} className="compass-guide-circle" />
        <line x1={0} y1={0} x2={tip.x} y2={tip.y} className="compass-leg" />
        <line x1={0} y1={0} x2={otherTip.x} y2={otherTip.y} className="compass-leg" />
        <circle cx={0} cy={0} r={10} className="instrument-body compass-pivot" />
        <circle cx={tip.x} cy={tip.y} r={6} className="compass-pencil-tip" />
        <text x={tool.size / 2} y={-14} textAnchor="middle" className="instrument-readout">
          r = {Math.round(tool.size)}
        </text>
        {handle(tip.x, tip.y, 'resize')}
        {handle(tool.size * 0.55 * Math.cos(arm - 0.35), tool.size * 0.55 * Math.sin(arm - 0.35), 'rotate')}
      </g>
    );
  };

  return (
    <div className={`canvas-container ${colorInverted ? 'color-inverted' : ''}`}>
      <svg
        ref={svgRef}
        className="board-svg"
        style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (activeTool === 'laser') setLaserCursor(null);
          if (activeTool === 'eraser') setEraserCursor(null);
        }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <defs>
          <clipPath id="board-page-clip">
            <rect width={page.width} height={page.height} />
          </clipPath>
        </defs>

        <g
          transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}
          clipPath="url(#board-page-clip)"
        >
          <PageBackground
            id={page.id}
            width={page.width}
            height={page.height}
            background={page.background}
            patternVisible={patternVisible}
          />
          <rect
            width={page.width}
            height={page.height}
            fill="none"
            stroke="#32394b"
            strokeWidth={1}
            pointerEvents="none"
          />

          {renderGeometryTool()}

          {!page.imageQualityScale && (
            <foreignObject x={60} y={45} width={760} height={106}>
              <div className="lesson-header-block" onPointerDown={(e) => e.stopPropagation()}>
                <input
                  className="lesson-title-input"
                  value={page.title}
                  onChange={(e) => onUpdatePageHeader(e.target.value, page.subtitle)}
                  placeholder="Untitled page"
                />
                <div className="lesson-title-divider" />
                <span className="lesson-created-at">{page.createdAt}</span>
              </div>
            </foreignObject>
          )}

          {/* Committed Geometric Shapes & Cartesian Planes */}
          {page.shapes.map((sh) => (
            <g
              key={sh.id}
              transform={
                selectedSet.has(sh.id) && selectionDelta
                  ? `translate(${selectionDelta.x} ${selectionDelta.y})`
                  : undefined
            }
            >
              <ShapeRenderer
                shape={sh}
                onErase={
                  activeTool === 'eraser' && eraserMode === 'stroke'
                    ? () => onEraseShape(sh.id)
                    : undefined
                }
              />
            </g>
          ))}

          {/* Draft Shape Preview while Dragging */}
          {draftShape && <ShapeRenderer shape={draftShape} isPreview />}

          {page.graphs.map((graph) => (
            <g
              key={graph.id}
              transform={
                selectedSet.has(graph.id) && selectionDelta
                  ? `translate(${selectionDelta.x} ${selectionDelta.y})`
                  : undefined
              }
            >
              <GraphRenderer
                graph={graph}
                activeTool={activeTool}
                canvasZoom={viewport.zoom}
                onChange={onUpdateGraph}
              />
            </g>
          ))}

          {/* Committed Strokes (Pen & Highlighter) */}
          {page.strokes.map((stroke) => (
            <g
              key={stroke.id}
              transform={
                selectedSet.has(stroke.id) && selectionDelta
                  ? `translate(${selectionDelta.x} ${selectionDelta.y})`
                  : undefined
              }
            >
              <path
                data-stroke-id={stroke.id}
                d={getSvgPathFromPoints(stroke.points, stroke.size, stroke.pressureSensitive ?? true)}
                fill={stroke.color}
                opacity={stroke.tool === 'highlighter' ? 0.36 : 1}
                onPointerEnter={(e) => {
                  if (activeTool === 'eraser' && eraserMode === 'stroke' && e.buttons === 1) {
                    onEraseStroke(stroke.id);
                  }
                }}
                onPointerDown={() => {
                  if (activeTool === 'eraser' && eraserMode === 'stroke') {
                    onEraseStroke(stroke.id);
                  }
                }}
              />
            </g>
          ))}

          {(page.images ?? []).map((image) => {
            const displayedImage = imageTransformDraft?.id === image.id ? imageTransformDraft : image;
            return (
              <BoardImageRenderer
                key={image.id}
                image={displayedImage}
                selected={selectedSet.has(image.id)}
                selectionDelta={selectionDelta}
              />
            );
          })}

          {laserTrails.map((trail) => {
            const d = getSvgPathFromPoints(trail.points, trail.size, false);
            const head = trail.points[trail.points.length - 1];
            return (
              <g key={trail.id} className="laser-trail">
                <path d={d} className="laser-trail-glow" />
                <path d={d} className="laser-trail-core" />
                <circle cx={head.x} cy={head.y} r={5} className="laser-trail-head" />
              </g>
            );
          })}

          {/* Active In-Progress Stroke */}
          {currentStroke && (
            currentStroke.tool === 'laser' ? (
              <g className="laser-live-trail">
                <path
                  d={getSvgPathFromPoints(currentStroke.points, currentStroke.size, false)}
                  className="laser-trail-glow"
                />
                <path
                  d={getSvgPathFromPoints(currentStroke.points, currentStroke.size, false)}
                  className="laser-trail-core"
                />
                <circle
                  cx={currentStroke.points[currentStroke.points.length - 1].x}
                  cy={currentStroke.points[currentStroke.points.length - 1].y}
                  r={5}
                  className="laser-trail-head"
                />
              </g>
            ) : (
              <path
                d={getSvgPathFromPoints(
                  currentStroke.points,
                  currentStroke.size,
                  currentStroke.pressureSensitive ?? true
                )}
                fill={currentStroke.color}
                opacity={currentStroke.tool === 'highlighter' ? 0.36 : 1}
              />
            )
          )}

          {activeTool === 'laser' && laserCursor && !currentStroke && (
            <circle cx={laserCursor.x} cy={laserCursor.y} r={7 / viewport.zoom} className="laser-cursor-dot" />
          )}

          {classicErasePath.length > 0 && (
            <>
              {classicErasePath.length > 1 && (
                <polyline
                  points={classicErasePath.map((point) => `${point.x},${point.y}`).join(' ')}
                  className="classic-eraser-preview"
                  strokeWidth={eraserWidth / viewport.zoom}
                />
              )}
              <circle
                cx={classicErasePath[classicErasePath.length - 1].x}
                cy={classicErasePath[classicErasePath.length - 1].y}
                r={(eraserWidth / 2) / viewport.zoom}
                className="classic-eraser-head"
              />
            </>
          )}
          {activeTool === 'eraser' && eraserMode === 'classic' && classicErasePath.length === 0 && eraserCursor && (
            <circle
              cx={eraserCursor.x}
              cy={eraserCursor.y}
              r={(eraserWidth / 2) / viewport.zoom}
              className="classic-eraser-head"
            />
          )}

          {/* Circle-to-Erase Active Drawing Loop */}
          {eraserLoop.length > 1 && (
            <polyline
              points={eraserLoop.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(224, 108, 117, 0.12)"
              stroke="#e06c75"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
          {selectionLasso.length > 1 && (
            <polyline
              points={selectionLasso.map((point) => `${point.x},${point.y}`).join(' ')}
              className="selection-lasso"
            />
          )}

          {/* Circle-to-Erase Closed Polygon + Tap-Center Target */}
          {pendingErasePoly && pendingCenter && (
            <g
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                executePolygonErase(pendingErasePoly);
              }}
            >
              <polygon
                points={pendingErasePoly.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(224, 108, 117, 0.16)"
                stroke="#e06c75"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <circle cx={pendingCenter.x} cy={pendingCenter.y} r={18} fill="#e06c75" />
              <text
                x={pendingCenter.x}
                y={pendingCenter.y + 5}
                fill="#ffffff"
                fontSize="16"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                ✕
              </text>
            </g>
          )}

          {page.screenShade && (
            <g
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                const world = screenToWorld(event.clientX, event.clientY);
                const position = shadeVertical ? world.x / page.width : world.y / page.height;
                onUpdateScreenShade(Math.max(0.05, Math.min(0.95, position)));
              }}
              style={{ cursor: shadeVertical ? 'ew-resize' : 'ns-resize' }}
            >
              <rect
                width={shadeVertical ? page.width * page.screenShade.reveal : page.width}
                height={shadeVertical ? page.height : page.height * page.screenShade.reveal}
                fill="rgba(12, 16, 24, 0.94)"
              />
              <rect
                x={shadeVertical ? page.width * page.screenShade.reveal - 7 : 0}
                y={shadeVertical ? 0 : page.height * page.screenShade.reveal - 7}
                width={shadeVertical ? 14 : page.width}
                height={shadeVertical ? page.height : 14}
                fill="#61afef"
                fillOpacity="0.75"
              />
            </g>
          )}

          <g
            transform={`translate(${page.width / 2}, ${page.height - 44})`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setExtendPromptOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={-70} y={-18} width={140} height={30} rx={6} fill="#222633" stroke="#61afef" />
            <text x={0} y={2} fill="#e2e8f0" fontSize={12} textAnchor="middle">
              Extend page
            </text>
          </g>

          {selectionRect && (
            <rect
              x={selectionRect.x + (selectionDelta?.x ?? 0)}
              y={selectionRect.y + (selectionDelta?.y ?? 0)}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(97,175,239,0.06)"
              stroke="#61afef"
              strokeWidth={1.5 / viewport.zoom}
              strokeDasharray={`${6 / viewport.zoom} ${4 / viewport.zoom}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      {scrollRange > 0 && (
        <div
          className="canvas-scroll-track"
          role="scrollbar"
          aria-orientation="vertical"
          aria-label="Scroll page vertically"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((-viewport.y / scrollRange) * 100)}
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={() => { scrollbarDrag.current = null; }}
          onPointerCancel={() => { scrollbarDrag.current = null; }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            setViewport(clampViewport({
              ...viewport,
              y: viewport.y + (event.key === 'ArrowUp' ? 48 : -48),
            }));
          }}
          tabIndex={0}
        >
          <div
            className="canvas-scroll-thumb"
            style={{ height: thumbHeight, top: thumbTop }}
          />
        </div>
      )}
      {extendPromptOpen && (
        <div className="extend-confirmation" role="status">
          <span>You reached the bottom of the page.</span>
          <button onClick={() => {
            onExtendPage(page.height + 1000);
            setExtendPromptOpen(false);
          }}>
            Extend page
          </button>
          <button className="extend-dismiss" onClick={() => setExtendPromptOpen(false)} aria-label="Dismiss extension prompt">×</button>
        </div>
      )}
      {contextMenu && (
        <div
          className="selection-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.ids.length > 1 && (
            <button
              onClick={() => {
                if (contextIsOneGroup) onUngroupItems(contextMenu.ids);
                else onGroupItems(contextMenu.ids, crypto.randomUUID());
                setSelectedIds(contextMenu.ids);
                setContextMenu(null);
              }}
            >
              {contextIsOneGroup ? 'Ungroup' : 'Group selected'}
            </button>
          )}
          <button
            onClick={() => {
              onDeleteItems(contextMenu.ids);
              setSelectedIds([]);
              setContextMenu(null);
            }}
          >
            Delete selected
          </button>
          <button onClick={() => setContextMenu(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
};