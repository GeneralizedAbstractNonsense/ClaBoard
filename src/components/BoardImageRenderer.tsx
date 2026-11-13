import React from 'react';
import { BoardImage } from '../types/board';

interface BoardImageRendererProps {
  image: BoardImage;
  selected?: boolean;
  selectionDelta?: { x: number; y: number } | null;
}

export const BoardImageRenderer: React.FC<BoardImageRendererProps> = ({
  image,
  selected = false,
  selectionDelta,
}) => (
  <g
    data-image-object-id={image.id}
    transform={`translate(${selectionDelta?.x ?? 0} ${selectionDelta?.y ?? 0}) translate(${image.x} ${image.y}) rotate(${image.rotation} ${image.width / 2} ${image.height / 2})`}
  >
    <image
      data-image-id={image.id}
      href={image.imageData}
      x={0}
      y={0}
      width={image.width}
      height={image.height}
      preserveAspectRatio="none"
    />
    {selected && (
      <>
        <rect
          x={-2}
          y={-2}
          width={image.width + 4}
          height={image.height + 4}
          fill="none"
          stroke="#1684f8"
          strokeWidth={2}
          strokeDasharray="7 4"
          pointerEvents="none"
        />
        <line x1={image.width / 2} y1={0} x2={image.width / 2} y2={-20} stroke="#1684f8" strokeWidth={2} pointerEvents="none" />
        <circle
          cx={image.width / 2}
          cy={-22}
          r={7}
          fill="#fff"
          stroke="#1684f8"
          strokeWidth={2}
          data-image-action="rotate"
          data-image-action-id={image.id}
          data-image-id={image.id}
          className="image-transform-handle"
        />
        <circle
          cx={image.width}
          cy={image.height}
          r={8}
          fill="#fff"
          stroke="#1684f8"
          strokeWidth={2}
          data-image-action="resize"
          data-image-action-id={image.id}
          data-image-id={image.id}
          className="image-transform-handle"
        />
      </>
    )}
  </g>
);
