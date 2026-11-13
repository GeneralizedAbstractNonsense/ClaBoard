import React from 'react';
import { BoardShape } from '../types/board';

interface ShapeRendererProps {
  shape: BoardShape;
  isPreview?: boolean;
  onErase?: () => void;
}

function regularPolygonPoints(cx: number, cy: number, rx: number, ry: number, sides: number): string {
  const pts: string[] = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({ shape, isPreview, onErase }) => {
  const { kind, x1, y1, x2, y2, color, strokeWidth, filled } = shape;

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 4);
  const h = Math.max(Math.abs(y2 - y1), 4);
  const cx = minX + w / 2;
  const cy = minY + h / 2;

  const fillStyle = filled ? shape.fillColor ?? color : 'transparent';
  const fillOpacity = 1;

  const interactionProps = {
    'data-shape-id': shape.id,
    style: { cursor: onErase ? 'pointer' : 'default' },
    opacity: isPreview ? 0.75 : 1,
    onPointerDown: (e: React.PointerEvent) => {
      if (onErase) {
        e.stopPropagation();
        onErase();
      }
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (onErase && e.buttons === 1) {
        onErase();
      }
    },
  };

  if (kind === 'freeform' && shape.points && shape.points.length > 2) {
    return (
      <g {...interactionProps}>
        <polygon
          points={shape.points.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill={fillStyle}
          fillOpacity={fillOpacity}
          fillRule="evenodd"
        />
      </g>
    );
  }

  // 1. Straight Line
  if (kind === 'line') {
    return (
      <g {...interactionProps}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </g>
    );
  }

  // 2. Circle (1:1 constrained radius)
  if (kind === 'circle') {
    const r = Math.min(w, h) / 2;
    const scx = x1 + (x2 >= x1 ? r : -r);
    const scy = y1 + (y2 >= y1 ? r : -r);
    return (
      <g {...interactionProps}>
        <circle
          cx={scx}
          cy={scy}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 3. Ellipse
  if (kind === 'ellipse') {
    return (
      <g {...interactionProps}>
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 4. Square (1:1 constrained side)
  if (kind === 'square') {
    const side = Math.min(w, h);
    const sx = x2 >= x1 ? x1 : x1 - side;
    const sy = y2 >= y1 ? y1 : y1 - side;
    return (
      <g {...interactionProps}>
        <rect
          x={sx}
          y={sy}
          width={side}
          height={side}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 5. Triangle
  if (kind === 'triangle') {
    const pts = `${cx},${minY} ${minX + w},${minY + h} ${minX},${minY + h}`;
    return (
      <g {...interactionProps}>
        <polygon
          points={pts}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 6. Regular Polygons: Pentagon, Hexagon, Octagon
  if (kind === 'pentagon' || kind === 'hexagon' || kind === 'octagon') {
    const sides = kind === 'pentagon' ? 5 : kind === 'hexagon' ? 6 : 8;
    const pts = regularPolygonPoints(cx, cy, w / 2, h / 2, sides);
    return (
      <g {...interactionProps}>
        <polygon
          points={pts}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 7. Heart
  if (kind === 'heart') {
    const topCurveY = minY + h * 0.28;
    const d = [
      `M ${cx} ${minY + h}`,
      `C ${minX} ${minY + h * 0.65}, ${minX} ${minY}, ${cx} ${topCurveY}`,
      `C ${minX + w} ${minY}, ${minX + w} ${minY + h * 0.65}, ${cx} ${minY + h}`,
      'Z',
    ].join(' ');
    return (
      <g {...interactionProps}>
        <path
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
      </g>
    );
  }

  // 8. Warning Triangle (!)
  if (kind === 'warning') {
    const pts = `${cx},${minY} ${minX + w},${minY + h} ${minX},${minY + h}`;
    const fontSize = Math.max(14, Math.min(w, h) * 0.45);
    return (
      <g {...interactionProps}>
        <polygon
          points={pts}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill={fillStyle}
          fillOpacity={fillOpacity}
        />
        <text
          x={cx}
          y={minY + h * 0.84}
          fill={color}
          fontSize={fontSize}
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="monospace"
        >
          !
        </text>
      </g>
    );
  }

  // 9. Number Line (1D: Unmetered & Metered)
  if (kind.startsWith('number-line')) {
    const lineY = cy;
    const isMetered = kind !== 'number-line-unmetered';
    const showNumbers = kind === 'number-line-metered';
    const step = 40;
    const halfUnits = Math.floor((w / 2 - 20) / step);
    const ticks: number[] = [];
    if (isMetered) {
      for (let i = -halfUnits; i <= halfUnits; i++) ticks.push(i);
    }

    return (
      <g {...interactionProps}>
        <line x1={minX} y1={lineY} x2={minX + w} y2={lineY} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${minX + w - 10},${lineY - 6} ${minX + w},${lineY} ${minX + w - 10},${lineY + 6}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={minX + w + 8} y={lineY + 4} fill={color} fontSize="13" fontFamily="monospace">
          x
        </text>
        {!isMetered && (
          <>
            <line x1={cx} y1={lineY - 6} x2={cx} y2={lineY + 6} stroke={color} strokeWidth={strokeWidth} />
            <text x={cx - 4} y={lineY + 20} fill={color} fontSize="12" fontFamily="monospace">
              O
            </text>
          </>
        )}
        {isMetered &&
          ticks.map((t) => {
            const tx = cx + t * step;
            return (
              <g key={t}>
                <line x1={tx} y1={lineY - 6} x2={tx} y2={lineY + 6} stroke={color} strokeWidth={strokeWidth} />
                {showNumbers && (
                  <text x={tx} y={lineY + 20} fill={color} fontSize="11" textAnchor="middle" fontFamily="monospace">
                    {t}
                  </text>
                )}
              </g>
            );
          })}
      </g>
    );
  }

  // 10. 2D Cartesian Plane (Unmetered & Metered)
  if (kind.startsWith('cartesian-2d')) {
    const isMetered = kind !== 'cartesian-2d-unmetered';
    const showNumbers = kind === 'cartesian-2d-metered';
    const step = 36;
    const halfX = Math.floor((w / 2 - 18) / step);
    const halfY = Math.floor((h / 2 - 18) / step);
    const xTicks: number[] = [];
    const yTicks: number[] = [];
    if (isMetered) {
      for (let i = -halfX; i <= halfX; i++) if (i !== 0) xTicks.push(i);
      for (let i = -halfY; i <= halfY; i++) if (i !== 0) yTicks.push(i);
    }

    return (
      <g {...interactionProps}>
        {/* Optional subtle sub-grid when metered */}
        {isMetered &&
          xTicks.map((i) => (
            <line
              key={`gx-${i}`}
              x1={cx + i * step}
              y1={minY + 10}
              x2={cx + i * step}
              y2={minY + h - 10}
              stroke={color}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
          ))}
        {isMetered &&
          yTicks.map((i) => (
            <line
              key={`gy-${i}`}
              x1={minX + 10}
              y1={cy - i * step}
              x2={minX + w - 10}
              y2={cy - i * step}
              stroke={color}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
          ))}

        {/* X Axis */}
        <line x1={minX} y1={cy} x2={minX + w} y2={cy} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${minX + w - 10},${cy - 6} ${minX + w},${cy} ${minX + w - 10},${cy + 6}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={minX + w + 8} y={cy + 4} fill={color} fontSize="13" fontFamily="monospace">
          x
        </text>

        {/* Y Axis */}
        <line x1={cx} y1={minY + h} x2={cx} y2={minY} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${cx - 6},${minY + 10} ${cx},${minY} ${cx + 6},${minY + 10}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={cx + 8} y={minY + 4} fill={color} fontSize="13" fontFamily="monospace">
          y
        </text>

        {/* Origin */}
        <text x={cx - 12} y={cy + 15} fill={color} fontSize="11" fontFamily="monospace">
          O
        </text>

        {/* Ticks & Numbers */}
        {showNumbers &&
          xTicks.map((i) => (
            <g key={`tx-${i}`}>
              <line x1={cx + i * step} y1={cy - 4} x2={cx + i * step} y2={cy + 4} stroke={color} strokeWidth={1.5} />
              <text x={cx + i * step} y={cy + 16} fill={color} fontSize="10" textAnchor="middle" fontFamily="monospace">
                {i}
              </text>
            </g>
          ))}
        {isMetered && !showNumbers &&
          xTicks.map((i) => (
            <line
              key={`tx-${i}`}
              x1={cx + i * step}
              y1={cy - 4}
              x2={cx + i * step}
              y2={cy + 4}
              stroke={color}
              strokeWidth={1.5}
            />
          ))}
        {showNumbers &&
          yTicks.map((i) => (
            <g key={`ty-${i}`}>
              <line x1={cx - 4} y1={cy - i * step} x2={cx + 4} y2={cy - i * step} stroke={color} strokeWidth={1.5} />
              <text x={cx - 12} y={cy - i * step + 3} fill={color} fontSize="10" textAnchor="end" fontFamily="monospace">
                {i}
              </text>
            </g>
          ))}
        {isMetered && !showNumbers &&
          yTicks.map((i) => (
            <line
              key={`ty-${i}`}
              x1={cx - 4}
              y1={cy - i * step}
              x2={cx + 4}
              y2={cy - i * step}
              stroke={color}
              strokeWidth={1.5}
            />
          ))}
      </g>
    );
  }

  // 11. 3D Cartesian Space (Unmetered & Metered)
  if (kind.startsWith('cartesian-3d')) {
    const isMetered = kind !== 'cartesian-3d-unmetered';
    const showNumbers = kind === 'cartesian-3d-metered';
    const ox = minX + w * 0.42;
    const oy = minY + h * 0.56;

    const zTopY = minY + 12;
    const yRightX = minX + w - 12;
    const xEndX = minX + w * 0.12;
    const xEndY = minY + h - 12;

    const step = 32;
    const zCount = Math.floor((oy - zTopY - 16) / step);
    const yCount = Math.floor((yRightX - ox - 16) / step);
    const xLen = Math.hypot(xEndX - ox, xEndY - oy);
    const xCount = Math.floor((xLen - 16) / step);
    const ux = (xEndX - ox) / (xLen || 1);
    const uy = (xEndY - oy) / (xLen || 1);

    return (
      <g {...interactionProps}>
        {/* Z Axis (Vertical) */}
        <line x1={ox} y1={oy} x2={ox} y2={zTopY} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${ox - 5},${zTopY + 9} ${ox},${zTopY} ${ox + 5},${zTopY + 9}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={ox + 8} y={zTopY + 6} fill={color} fontSize="13" fontFamily="monospace">
          z
        </text>

        {/* Y Axis (Horizontal Right) */}
        <line x1={ox} y1={oy} x2={yRightX} y2={oy} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${yRightX - 9},${oy - 5} ${yRightX},${oy} ${yRightX - 9},${oy + 5}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={yRightX + 6} y={oy + 4} fill={color} fontSize="13" fontFamily="monospace">
          y
        </text>

        {/* X Axis (Oblique Front-Left) */}
        <line x1={ox} y1={oy} x2={xEndX} y2={xEndY} stroke={color} strokeWidth={strokeWidth} />
        <polyline
          points={`${xEndX + 2},${xEndY - 10} ${xEndX},${xEndY} ${xEndX + 10},${xEndY - 3}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <text x={xEndX - 14} y={xEndY + 8} fill={color} fontSize="13" fontFamily="monospace">
          x
        </text>

        <text x={ox - 14} y={oy - 6} fill={color} fontSize="11" fontFamily="monospace">
          O
        </text>

        {/* Metered Ticks on X, Y, Z */}
        {isMetered &&
          Array.from({ length: zCount }, (_, idx) => idx + 1).map((i) => (
            <g key={`z-${i}`}>
              <line
                x1={ox - 4}
                y1={oy - i * step}
                x2={ox + 4}
                y2={oy - i * step}
                stroke={color}
                strokeWidth={1.5}
              />
              {showNumbers && (
                <text x={ox + 8} y={oy - i * step + 4} fill={color} fontSize="9" fontFamily="monospace">
                  {i}
                </text>
              )}
            </g>
          ))}
        {isMetered &&
          Array.from({ length: yCount }, (_, idx) => idx + 1).map((i) => (
            <g key={`y-${i}`}>
              <line
                x1={ox + i * step}
                y1={oy - 4}
                x2={ox + i * step}
                y2={oy + 4}
                stroke={color}
                strokeWidth={1.5}
              />
              {showNumbers && (
                <text x={ox + i * step} y={oy + 15} fill={color} fontSize="9" textAnchor="middle" fontFamily="monospace">
                  {i}
                </text>
              )}
            </g>
          ))}
        {isMetered &&
          Array.from({ length: xCount }, (_, idx) => idx + 1).map((i) => {
            const px = ox + ux * i * step;
            const py = oy + uy * i * step;
            return (
              <g key={`x-${i}`}>
                <line
                  x1={px - 4}
                  y1={py - 2}
                  x2={px + 4}
                  y2={py + 2}
                  stroke={color}
                  strokeWidth={1.5}
                />
                {showNumbers && (
                  <text x={px - 8} y={py + 14} fill={color} fontSize="9" fontFamily="monospace">
                    {i}
                  </text>
                )}
              </g>
            );
          })}
      </g>
    );
  }

  return null;
};