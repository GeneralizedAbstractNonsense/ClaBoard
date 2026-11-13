import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointer2, Presentation, X } from 'lucide-react';
import { BoardPage } from '../types/board';
import { getSvgPathFromPoints } from '../utils/strokeUtils';
import { PageBackground } from './PageBackground';
import { ShapeRenderer } from './ShapeRenderer';
import { BoardImageRenderer } from './BoardImageRenderer';

interface PresentationViewProps {
  pages: BoardPage[];
  initialPageId: string;
  onExit: () => void;
}

interface LaserMark {
  id: number;
  points: { x: number; y: number }[];
}

export const PresentationView: React.FC<PresentationViewProps> = ({
  pages,
  initialPageId,
  onExit,
}) => {
  const initialIndex = Math.max(0, pages.findIndex((page) => page.id === initialPageId));
  const [slideIndex, setSlideIndex] = useState(initialIndex);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [laserPoint, setLaserPoint] = useState<{ x: number; y: number } | null>(null);
  const [laserMarks, setLaserMarks] = useState<LaserMark[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const drawingLaser = useRef<{ id: number; points: { x: number; y: number }[] } | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const controlsTimeout = useRef<number | null>(null);
  const markId = useRef(0);
  const timeouts = useRef(new Set<number>());
  const page = pages[slideIndex];
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeout.current !== null) window.clearTimeout(controlsTimeout.current);
    controlsTimeout.current = window.setTimeout(() => setControlsVisible(false), 1000);
  }, []);

  useEffect(() => {
    revealControls();
    const onKeyDown = (event: KeyboardEvent) => {
      revealControls();
      if (event.key === 'Escape') onExit();
      else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setSlideIndex((index) => Math.min(pages.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setSlideIndex((index) => Math.max(0, index - 1));
      }
    };
    const onWheel = (event: WheelEvent) => {
      revealControls();
      if (Math.abs(event.deltaY) < 12) return;
      setSlideIndex((index) => Math.max(0, Math.min(pages.length - 1, index + (event.deltaY > 0 ? 1 : -1))));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [onExit, pages.length, revealControls]);

  useEffect(() => () => {
    timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    if (controlsTimeout.current !== null) window.clearTimeout(controlsTimeout.current);
  }, []);

  const normalizedPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1000,
      y: ((event.clientY - rect.top) / rect.height) * 1000,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    revealControls();
    if (!laserEnabled) {
      swipeStart.current = { x: event.clientX, y: event.clientY };
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = normalizedPoint(event);
    drawingLaser.current = { id: ++markId.current, points: [point] };
    setLaserPoint(point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    revealControls();
    if (!laserEnabled) return;
    const point = normalizedPoint(event);
    setLaserPoint(point);
    if (drawingLaser.current) {
      drawingLaser.current.points.push(point);
      const current = drawingLaser.current;
      setLaserMarks((marks) => [
        ...marks.filter((mark) => mark.id !== current.id),
        { id: current.id, points: [...current.points] },
      ]);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawingLaser.current) {
      const { id } = drawingLaser.current;
      drawingLaser.current = null;
      const timeout = window.setTimeout(() => {
        setLaserMarks((marks) => marks.filter((mark) => mark.id !== id));
        timeouts.current.delete(timeout);
      }, 1700);
      timeouts.current.add(timeout);
      return;
    }
    if (!swipeStart.current) return;
    const deltaX = event.clientX - swipeStart.current.x;
    const deltaY = event.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setSlideIndex((index) => Math.max(0, Math.min(pages.length - 1, index + (deltaX < 0 ? 1 : -1))));
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  };

  return (
    <div
      className={`presentation-view ${laserEnabled ? 'laser-enabled' : ''}`}
      onClick={(event) => {
        revealControls();
        if (suppressClick.current) return;
        if (laserEnabled || (event.target as HTMLElement).closest('.presentation-controls')) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        setSlideIndex((index) => Math.max(0, Math.min(pages.length - 1, index + (event.clientX > bounds.left + bounds.width / 2 ? 1 : -1))));
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => { if (!drawingLaser.current) setLaserPoint(null); }}
    >
      <svg
        className="presentation-slide"
        viewBox={`0 0 ${page.width} ${page.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          maxWidth: `${page.width * (page.imageQualityScale ?? 1)}px`,
          maxHeight: `${page.height * (page.imageQualityScale ?? 1)}px`,
        }}
      >
        <PageBackground
          id={`presentation-${page.id}`}
          width={page.width}
          height={page.height}
          background={page.background}
          patternVisible={false}
        />
        {page.strokes.map((stroke) => (
          <path
            key={stroke.id}
            d={getSvgPathFromPoints(stroke.points, stroke.size, stroke.pressureSensitive ?? true)}
            fill={stroke.color}
            opacity={stroke.tool === 'highlighter' ? 0.36 : 1}
          />
        ))}
        {page.shapes.map((shape) => <ShapeRenderer key={shape.id} shape={shape} />)}
        {page.images?.map((image) => <BoardImageRenderer key={image.id} image={image} />)}
      </svg>
      {laserEnabled && (
        <svg className="presentation-laser-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {laserMarks.map((mark) => (
            <polyline
              key={mark.id}
              points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')}
              className="presentation-laser-trail"
            />
          ))}
          {laserPoint && <circle cx={laserPoint.x} cy={laserPoint.y} r={8} className="presentation-laser-dot" />}
        </svg>
      )}
      <div
        className={`presentation-controls ${controlsVisible ? 'controls-visible' : 'controls-hidden'}`}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="presentation-slide-count">{page.title || `Slide ${slideIndex + 1}`} · {slideIndex + 1} / {pages.length}</div>
        <div className="presentation-control-buttons">
          <button onClick={(event) => { event.stopPropagation(); setSlideIndex((index) => Math.max(0, index - 1)); }} title="Previous slide">
            <ChevronLeft size={18} />
          </button>
          <button
            className={laserEnabled ? 'active' : ''}
            onClick={(event) => { event.stopPropagation(); setLaserEnabled((enabled) => !enabled); }}
            title={laserEnabled ? 'Disable laser pointer' : 'Enable laser pointer'}
          >
            <MousePointer2 size={16} /> Laser
          </button>
          <button onClick={(event) => { event.stopPropagation(); setSlideIndex((index) => Math.min(pages.length - 1, index + 1)); }} title="Next slide">
            <ChevronRight size={18} />
          </button>
          <button onClick={(event) => { event.stopPropagation(); onExit(); }} title="Exit presentation">
            <X size={16} />
          </button>
        </div>
        <Presentation size={16} className="presentation-mark" />
      </div>
    </div>
  );
};
