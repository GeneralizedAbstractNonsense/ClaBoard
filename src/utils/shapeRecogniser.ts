import { BoardShape, StrokePoint } from '../types/board';

/**
 * Ray-casting Point-in-Polygon test for Circle-to-Erase
 */
export function isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getPolygonCentroid(polygon: { x: number; y: number }[]): { x: number; y: number } {
  if (polygon.length === 0) return { x: 0, y: 0 };
  const sum = polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

/**
 * Recognizes hand-drawn straight lines, circles, squares/rectangles, and triangles.
 * Returns a crisp BoardShape if recognized, or null to keep the freehand stroke.
 */
export function recognizeMagicShape(
  points: StrokePoint[],
  color: string,
  strokeWidth: number
): BoardShape | null {
  if (points.length < 6) return null;

  const start = points[0];
  const end = points[points.length - 1];

  let pathLength = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) {
      pathLength += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    }
  }

  if (pathLength < 25) return null;

  const endDist = Math.hypot(end.x - start.x, end.y - start.y);
  const width = maxX - minX;
  const height = maxY - minY;

  // 1. Straight Line detection (with gentle horizontal/vertical snap)
  if (endDist / pathLength > 0.93) {
    let x2 = end.x;
    let y2 = end.y;
    const angle = Math.abs(Math.atan2(y2 - start.y, x2 - start.x));
    if (angle < 0.08 || Math.abs(angle - Math.PI) < 0.08) {
      y2 = start.y; // Horizontal snap
    } else if (Math.abs(angle - Math.PI / 2) < 0.08) {
      x2 = start.x; // Vertical snap
    }
    return {
      id: crypto.randomUUID(),
      kind: 'line',
      x1: start.x,
      y1: start.y,
      x2,
      y2,
      color,
      strokeWidth,
      filled: false,
    };
  }

  // 2. Closed Loop Shapes (Circle, Square, Triangle)
  const closeThreshold = Math.max(30, pathLength * 0.22);
  if (endDist <= closeThreshold && width > 20 && height > 20) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = width / 2;
    const ry = height / 2;

    // Normalized radial distance from center (1.0 = exact ellipse/circle)
    const normalizedRadii = points.map((p) =>
      Math.hypot((p.x - cx) / (rx || 1), (p.y - cy) / (ry || 1))
    );
    const meanR = normalizedRadii.reduce((a, b) => a + b, 0) / normalizedRadii.length;
    const stdR = Math.sqrt(
      normalizedRadii.reduce((acc, r) => acc + Math.pow(r - meanR, 2), 0) / normalizedRadii.length
    );

    const aspectRatio = width / height;

    // Circle / Ellipse
    if (stdR < 0.14) {
      const isCircle = aspectRatio >= 0.78 && aspectRatio <= 1.28;
      if (isCircle) {
        const side = (width + height) / 2;
        return {
          id: crypto.randomUUID(),
          kind: 'circle',
          x1: cx - side / 2,
          y1: cy - side / 2,
          x2: cx + side / 2,
          y2: cy + side / 2,
          color,
          strokeWidth,
          filled: false,
        };
      }
      return {
        id: crypto.randomUUID(),
        kind: 'ellipse',
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
        color,
        strokeWidth,
        filled: false,
      };
    }

    // Polygon area via Shoelace formula to distinguish Square from Triangle
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    const bboxArea = width * height;
    const fillRatio = area / (bboxArea || 1);

    // Square (fillRatio ~ 0.72 - 1.0)
    if (fillRatio > 0.68) {
      const side = (width + height) / 2;
      return {
        id: crypto.randomUUID(),
        kind: 'square',
        x1: cx - side / 2,
        y1: cy - side / 2,
        x2: cx + side / 2,
        y2: cy + side / 2,
        color,
        strokeWidth,
        filled: false,
      };
    }

    // Triangle (fillRatio ~ 0.35 - 0.62)
    if (fillRatio >= 0.34 && fillRatio <= 0.64) {
      return {
        id: crypto.randomUUID(),
        kind: 'triangle',
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
        color,
        strokeWidth,
        filled: false,
      };
    }
  }

  return null;
}