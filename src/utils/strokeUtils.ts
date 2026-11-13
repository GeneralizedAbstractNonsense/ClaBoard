import { getStroke } from 'perfect-freehand';
import { StrokePoint } from '../types/board';

export function getSvgPathFromPoints(
  points: StrokePoint[],
  size: number,
  pressureSensitive = true
): string {
  const inputPoints = points.map((p) => [p.x, p.y, p.pressure]);
  const outlinePoints = getStroke(inputPoints, {
    size,
    thinning: pressureSensitive ? 0.45 : 0,
    smoothing: 0.6,
    streamline: 0.55,
    simulatePressure: pressureSensitive,
  });

  if (!outlinePoints.length) return '';

  const d = outlinePoints.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0.toFixed(2), y0.toFixed(2), ((x0 + x1) / 2).toFixed(2), ((y0 + y1) / 2).toFixed(2));
      return acc;
    },
    ['M', outlinePoints[0][0].toFixed(2), outlinePoints[0][1].toFixed(2), 'Q']
  );

  d.push('Z');
  return d.join(' ');
}