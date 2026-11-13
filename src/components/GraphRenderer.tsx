import React, { useEffect, useRef, useState } from 'react';
import { BoardGraph, ToolType } from '../types/board';

interface GraphRendererProps {
  graph: BoardGraph;
  activeTool: ToolType;
  canvasZoom: number;
  onChange: (graph: BoardGraph) => void;
  evaluator?: (x: number, y: number) => number | null;
}

interface GraphDrag {
  clientX: number;
  clientY: number;
  x: number;
  y: number;
}

export const GraphRenderer: React.FC<GraphRendererProps> = ({
  graph,
  activeTool,
  canvasZoom,
  onChange,
  evaluator: staticEvaluator,
}) => {
  const drag = useRef<GraphDrag | null>(null);
  const [evaluateFunction, setEvaluateFunction] = useState<
    ((scope: { x: number; y: number }) => number) | null
  >(null);
  const [compileFailed, setCompileFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setEvaluateFunction(null);
    setCompileFailed(false);
    import('mathjs').then(({ compile }) => {
      try {
        const compiled = compile(graph.expression);
        if (active) {
          setEvaluateFunction(() => (scope: { x: number; y: number }) =>
            Number(compiled.evaluate(scope)),
          );
        }
      } catch {
        if (active) setCompileFailed(true);
      }
    }).catch(() => {
      if (active) setCompileFailed(true);
    });
    return () => {
      active = false;
    };
  }, [graph.expression]);

  const evaluate = (x: number, y = 0): number | null => {
    try {
      const result = staticEvaluator
        ? staticEvaluator(x, y)
        : evaluateFunction?.({ x, y }) ?? null;
      return Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  };

  const plotTop = 30;
  const plotHeight = graph.height - plotTop - 8;
  const plotWidth = graph.width - 16;
  const centerX = graph.width / 2 + graph.panX;
  const centerY = plotTop + plotHeight / 2 + graph.panY;
  const scale = Math.min(plotWidth / 20, plotHeight / 20) * graph.zoom;
  const clipId = `graph-clip-${graph.id}`;

  const startDrag = (event: React.PointerEvent<SVGElement>, mode: 'move' | 'pan') => {
    if (mode === 'move') {
      if (activeTool === 'select') return;
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: graph.panX,
      y: graph.panY,
    };
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!drag.current) return;
    const dx = (event.clientX - drag.current.clientX) / canvasZoom;
    const dy = (event.clientY - drag.current.clientY) / canvasZoom;
    onChange({ ...graph, panX: drag.current.x + dx, panY: drag.current.y + dy });
  };

  const zoomGraph = (event: React.WheelEvent<SVGRectElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    onChange({ ...graph, zoom: Math.min(8, Math.max(0.35, graph.zoom * factor)) });
  };

  const make2dPath = () => {
    const points: string[] = [];
    let drawing = false;
    for (let index = 0; index <= 300; index++) {
      const x = -10 + (20 * index) / 300;
      const y = evaluate(x);
      if (y === null) {
        drawing = false;
        continue;
      }
      const px = centerX + x * scale;
      const py = centerY - y * scale;
      points.push(`${drawing ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`);
      drawing = true;
    }
    return points.join(' ');
  };

  const make3dPaths = () => {
    const paths: string[] = [];
    const steps = 20;
    const project = (x: number, y: number, z: number) => ({
      x: centerX + (x - y) * 0.42 * scale,
      y: centerY + ((x + y) * 0.22 - z * 0.3) * scale,
    });

    for (let axis = 0; axis <= steps; axis++) {
      const fixed = -5 + (10 * axis) / steps;
      for (const fixedAxis of ['x', 'y'] as const) {
        let path = '';
        let drawing = false;
        for (let index = 0; index <= steps; index++) {
          const variable = -5 + (10 * index) / steps;
          const x = fixedAxis === 'x' ? fixed : variable;
          const y = fixedAxis === 'y' ? fixed : variable;
          const z = evaluate(x, y);
          if (z === null) {
            drawing = false;
            continue;
          }
          const point = project(x, y, z);
          path += `${drawing ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)} `;
          drawing = true;
        }
        if (path) paths.push(path);
      }
    }
    return paths;
  };

  const graphPath2d = graph.dimension === '2d' ? make2dPath() : '';
  const graphPaths3d = graph.dimension === '3d' ? make3dPaths() : [];

  return (
    <g
      data-graph-id={graph.id}
      transform={`translate(${graph.x} ${graph.y})`}
      onPointerMove={moveDrag}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={8} y={plotTop} width={plotWidth} height={plotHeight} />
        </clipPath>
      </defs>
      <rect
        width={graph.width}
        height={graph.height}
        rx={8}
        fill="#151923"
        stroke="#61afef"
        strokeWidth={1.5}
      />
      <rect
        width={graph.width}
        height={24}
        rx={8}
        fill="#222633"
        onPointerDown={(event) => startDrag(event, 'move')}
        style={{ cursor: activeTool === 'select' ? 'move' : 'default' }}
      />
      <rect x={0} y={18} width={graph.width} height={6} fill="#222633" pointerEvents="none" />
      <text x={10} y={17} fill="#e2e8f0" fontSize={11} fontFamily="monospace" pointerEvents="none">
        {graph.dimension === '2d' ? 'y' : 'z'} = {graph.expression}
      </text>
      <text x={graph.width - 12} y={17} fill="#94a3b8" fontSize={10} textAnchor="end" fontFamily="monospace" pointerEvents="none">
        {Math.round(graph.zoom * 100)}%
      </text>
      <rect
        x={8}
        y={plotTop}
        width={plotWidth}
        height={plotHeight}
        fill="#1a1e27"
        onPointerDown={(event) => startDrag(event, 'pan')}
        onWheel={zoomGraph}
        style={{ cursor: 'grab' }}
      />
      <g clipPath={`url(#${clipId})`} pointerEvents="none">
        {Array.from({ length: 11 }, (_, index) => {
          const offset = index - 5;
          return (
            <g key={offset}>
              <line
                x1={centerX + offset * scale}
                y1={plotTop}
                x2={centerX + offset * scale}
                y2={graph.height - 8}
                stroke="rgba(148,163,184,0.12)"
              />
              <line
                x1={8}
                y1={centerY + offset * scale}
                x2={graph.width - 8}
                y2={centerY + offset * scale}
                stroke="rgba(148,163,184,0.12)"
              />
            </g>
          );
        })}
        <line x1={8} y1={centerY} x2={graph.width - 8} y2={centerY} stroke="#cbd5e1" strokeWidth={1.2} />
        <line x1={centerX} y1={plotTop} x2={centerX} y2={graph.height - 8} stroke="#cbd5e1" strokeWidth={1.2} />
        {graph.dimension === '2d' ? (
          <path d={graphPath2d} fill="none" stroke="#61afef" strokeWidth={2.2} />
        ) : (
          graphPaths3d.map((path, index) => (
            <path key={index} d={path} fill="none" stroke="#61afef" strokeOpacity={0.75} strokeWidth={1.1} />
          ))
        )}
      </g>
      {!staticEvaluator && !evaluateFunction && !compileFailed && (
        <text x={graph.width / 2} y={graph.height / 2} fill="#94a3b8" textAnchor="middle" fontSize={12}>
          Loading graph…
        </text>
      )}
      {compileFailed && (
        <text x={graph.width / 2} y={graph.height / 2} fill="#e06c75" textAnchor="middle" fontSize={12}>
          Invalid function
        </text>
      )}
    </g>
  );
};
