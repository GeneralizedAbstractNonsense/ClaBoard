import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Undo2, Redo2, FileUp, Plus, X, Save,
  MousePointer, Shapes, PenTool, Eraser, Wand2,
  Settings, Presentation, PanelBottom, PanelTop, CircleDot, Trash2,
  Ruler, Calculator, Clock3, Play, Pause, RotateCcw
} from 'lucide-react';
import { EraserMode, GeometryToolKind, RibbonSubmenu, ShapeKind, ToolType } from '../types/board';

interface TopBarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  isDocked: boolean;
  onToggleDock: () => void;
  onOpenGraphDialog: () => void;
  onOpenGeometryTool: (kind: GeometryToolKind) => void;
  onOpenCalculator: () => void;
  onImportImage: (file: File) => void;
  onPresent: () => void;
  isPdfPage: boolean;
  recordingState: 'idle' | 'recording' | 'paused' | 'converting';
  onStartRecording: () => void;
  onSavePdf: () => void;
  activeSubmenu: RibbonSubmenu;
  setActiveSubmenu: (menu: RibbonSubmenu) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  pressureEnabled: boolean;
  setPressureEnabled: (enabled: boolean) => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  magicInkEnabled: boolean;
  setMagicInkEnabled: (v: boolean) => void;
  eraserMode: EraserMode;
  setEraserMode: (m: EraserMode) => void;
  eraserWidth: number;
  setEraserWidth: (width: number) => void;
  onClearPage: () => void;
  activeShape: ShapeKind;
  setActiveShape: (s: ShapeKind) => void;
  shapeFilled: boolean;
  setShapeFilled: (f: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onNewPage: () => void;
  onDeletePage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleFullscreen: () => void;
}

// 2 rows x 5 columns palette matching the Pen Submenu mockup
const SWATCH_COLORS = [
  '#1e222d', '#f8fafc', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
];

const BASIC_SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'line', label: 'Line' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'circle', label: 'Circle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'square', label: 'Square' },
  { id: 'pentagon', label: 'Pentagon' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'octagon', label: 'Octagon' },
  { id: 'heart', label: 'Heart' },
  { id: 'warning', label: 'Warning (!)' },
];

const MATH_AXES: { id: ShapeKind; label: string }[] = [
  { id: 'number-line-unmetered', label: '1D Unmetered' },
  { id: 'number-line-metered', label: '1D Metered' },
  { id: 'number-line-metered-no-numbers', label: '1D Metered · no numbers' },
  { id: 'cartesian-2d-unmetered', label: '2D Unmetered' },
  { id: 'cartesian-2d-metered', label: '2D Metered' },
  { id: 'cartesian-2d-metered-no-numbers', label: '2D Metered · no numbers' },
  { id: 'cartesian-3d-unmetered', label: '3D Unmetered' },
  { id: 'cartesian-3d-metered', label: '3D Metered' },
  { id: 'cartesian-3d-metered-no-numbers', label: '3D Metered · no numbers' },
];

function ShapePreviewIcon({ kind }: { kind: ShapeKind }) {
  const isMetered = kind.includes('metered');
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'line') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 20 20 4" /></svg>;
  }
  if (kind === 'circle' || kind === 'ellipse') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        {kind === 'circle' ? <circle cx="12" cy="12" r="8" /> : <ellipse cx="12" cy="12" rx="9" ry="6" />}
      </svg>
    );
  }
  if (kind === 'square') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="4" y="4" width="16" height="16" /></svg>;
  }
  if (kind === 'triangle' || kind === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="m12 3 10 18H2L12 3Z" />
        {kind === 'warning' && <path d="M12 9v5m0 3h.01" />}
      </svg>
    );
  }
  if (kind === 'heart') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11a4.8 4.8 0 0 1 8.8-2.6 4.8 4.8 0 0 1 8.8 2.6Z" /></svg>;
  }
  if (kind === 'pentagon' || kind === 'hexagon' || kind === 'octagon') {
    const sides = kind === 'pentagon' ? 5 : kind === 'hexagon' ? 6 : 8;
    const points = Array.from({ length: sides }, (_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / sides;
      return `${12 + 8 * Math.cos(angle)},${12 + 8 * Math.sin(angle)}`;
    }).join(' ');
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><polygon points={points} /></svg>;
  }
  if (kind.startsWith('number-line')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M3 12h17m-4-4 4 4-4 4" />
        {isMetered && <path d="M7 9v6m4-6v6m4-6v6" />}
      </svg>
    );
  }
  if (kind.startsWith('cartesian-3d')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M7 17 12 12 12 3m0 9h9M12 12l-7 7" />
        {isMetered && <path d="M10 8h4m-4 2h4m2 0v4m2-4v4M8 14l2 2m-4 0 2 2" />}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      <path d="M3 12h18M12 21V3m-4 2 4-2 4 2m2 3 2 4-2 4" />
      {isMetered && <path d="M6 10v4m3-4v4m6-4v4m3-4v4M10 6h4m-4 3h4m-4 6h4m-4 3h4" />}
    </svg>
  );
}

function DraftingCompassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6 6 21M12 6l7 15M8 16l8-5M10 5h4" />
      <path d="m5 21 2-1M18 21l2 1" />
    </svg>
  );
}

function FloodFillIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 10 9-6 6 9-9 6-6-9Z" fill="currentColor" fillOpacity=".22" />
      <path d="m7 8 6 9M12 6l6 8M3 19h8" />
      <path d="M18 17c0 1.1-.7 1.8-1.6 1.8s-1.6-.7-1.6-1.8 1.6-3 1.6-3 1.6 1.9 1.6 3Z" fill="currentColor" fillOpacity=".3" />
    </svg>
  );
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTool,
  setActiveTool,
  isDocked,
  onToggleDock,
  onOpenGraphDialog,
  onOpenGeometryTool,
  onOpenCalculator,
  onImportImage,
  onPresent,
  isPdfPage,
  recordingState,
  onStartRecording,
  onSavePdf,
  activeSubmenu,
  setActiveSubmenu,
  strokeWidth,
  setStrokeWidth,
  pressureEnabled,
  setPressureEnabled,
  strokeColor,
  setStrokeColor,
  magicInkEnabled,
  setMagicInkEnabled,
  eraserMode,
  setEraserMode,
  eraserWidth,
  setEraserWidth,
  onClearPage,
  activeShape,
  setActiveShape,
  shapeFilled,
  setShapeFilled,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onNewPage,
  onDeletePage,
  onPrevPage,
  onNextPage,
  onToggleFullscreen,
}) => {
  const [time, setTime] = useState<string>('');
  const [timerPopoverOpen, setTimerPopoverOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const clockPopoverRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const updateClock = () => setTime(new Date().toLocaleTimeString('en-GB'));
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (deadline === null) return;
    const updateRemaining = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) {
        setDeadline(null);
        const context = audioContextRef.current;
        if (context) {
          const now = context.currentTime;
          [0, 0.32, 0.64].forEach((offset) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.001, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.24);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(now + offset);
            oscillator.stop(now + offset + 0.25);
          });
        }
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 200);
    return () => window.clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (!timerPopoverOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!clockPopoverRef.current?.contains(event.target as Node)) setTimerPopoverOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [timerPopoverOpen]);

  useEffect(() => () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
  }, []);

  const startTimer = (duration = timerMinutes * 60 + timerSeconds) => {
    const seconds = Math.max(0, duration);
    if (seconds === 0) return;
    if (!audioContextRef.current && typeof window.AudioContext !== 'undefined') {
      audioContextRef.current = new AudioContext();
    }
    void audioContextRef.current?.resume();
    setRemainingSeconds(seconds);
    setDeadline(Date.now() + seconds * 1000);
  };

  const timerLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  // Shared right-hand Math Tools 2x2 block shown in contextual submenus
  const renderMathToolsBlock = () => (
    <div className="ribbon-group grid-2x2 math-tools-2x2">
      <button className="ribbon-btn" onClick={() => onOpenGeometryTool('ruler')}>
        <Ruler size={20} />
        <span>Ruler</span>
      </button>
      <button className="ribbon-btn" onClick={() => onOpenGeometryTool('protractor')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2 18h20a10 10 0 0 0-20 0Z" />
          <path d="M6 18a6 6 0 0 1 12 0" />
          <line x1="12" y1="8" x2="12" y2="11" />
          <line x1="7" y1="10" x2="8.5" y2="12.5" />
          <line x1="17" y1="10" x2="15.5" y2="12.5" />
        </svg>
        <span>Protractor</span>
      </button>
      <button className="ribbon-btn" onClick={() => onOpenGeometryTool('compass')}>
        <DraftingCompassIcon />
        <span>Compass</span>
      </button>
      <button className="ribbon-btn" onClick={onOpenCalculator}>
        <Calculator size={20} />
        <span>Sci Calc</span>
      </button>
    </div>
  );

  return (
    <header className="topbar-wrapper">
      <div className="system-strip">
        <div className="system-left">
          <span className="brand-badge">ClaBoard</span>
        </div>
        <div className="clock-popover-anchor" ref={clockPopoverRef}>
          <button
            className="system-clock"
            onClick={() => setTimerPopoverOpen((open) => !open)}
            aria-expanded={timerPopoverOpen}
            aria-label="Open clock and countdown timer"
          >
            <Clock3 size={14} />
            <span>{deadline !== null ? timerLabel : time}</span>
          </button>
          {timerPopoverOpen && (
            <div className="timer-popover">
              <strong>Countdown timer</strong>
              <div className="timer-inputs">
                <label>Minutes<input type="number" min={0} max={999} value={timerMinutes} onChange={(event) => setTimerMinutes(Math.max(0, Number(event.target.value)))} /></label>
                <span>:</span>
                <label>Seconds<input type="number" min={0} max={59} value={timerSeconds} onChange={(event) => setTimerSeconds(Math.min(59, Math.max(0, Number(event.target.value))))} /></label>
              </div>
              {remainingSeconds > 0 && <div className="timer-remaining">{timerLabel} remaining</div>}
              <div className="timer-actions">
                <button onClick={deadline !== null
                  ? () => setDeadline(null)
                  : () => startTimer(remainingSeconds > 0 ? remainingSeconds : undefined)}>
                  {deadline !== null ? <Pause size={14} /> : <Play size={14} />}
                  {deadline !== null ? 'Pause' : remainingSeconds > 0 ? 'Resume' : 'Start'}
                </button>
                <button onClick={() => { setDeadline(null); setRemainingSeconds(0); }}>
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
            </div>
          )}
        </div>
        <span className="system-strip-spacer" aria-hidden="true" />
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept="image/*,.svg"
        className="hidden-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onImportImage(file);
          event.currentTarget.value = '';
        }}
      />

      {/* Main Ribbon Area (Switches in-place between Home Ribbon and Tool Submenus) */}
      <div className="ribbon-bar">
        {activeSubmenu === 'home' && (
          <div className="ribbon-home">
            {/* Block 1: Navigation */}
            <div className="ribbon-group nav-group">
              <button className="ribbon-btn large" onClick={onPrevPage}>
                <ArrowLeft size={26} />
                <span>&lt; Prev</span>
              </button>
              <button className="ribbon-btn large" onClick={onNextPage}>
                <ArrowRight size={26} />
                <span>Next &gt;</span>
              </button>
            </div>

            {/* Block 2: History & Page Ops */}
            <div className="ribbon-group grid-3x2">
              <button className="ribbon-btn" onClick={onUndo} disabled={!canUndo}>
                <Undo2 size={20} />
                <span>Undo</span>
              </button>
              <button className="ribbon-btn" onClick={onRedo} disabled={!canRedo}>
                <Redo2 size={20} />
                <span>Redo</span>
              </button>
              <button className="ribbon-btn" onClick={() => importInputRef.current?.click()}>
                <FileUp size={20} />
                <span>Import</span>
              </button>
              <button className="ribbon-btn" onClick={onNewPage}>
                <Plus size={20} />
                <span>New Page</span>
              </button>
              <button className="ribbon-btn" onClick={onDeletePage}>
                <X size={20} />
                <span>Delete Page</span>
              </button>
              <button className="ribbon-btn" onClick={onSavePdf}>
                <Save size={20} />
                <span>Save PDF</span>
              </button>
            </div>

            {/* Block 3: Interactive Math Graph Preview Widget */}
            <div
              className="ribbon-group graph-widget"
              onClick={onOpenGraphDialog}
              title="Insert an interactive function graph"
            >
              <svg viewBox="0 0 140 86" className="mini-graph-svg">
                <line x1="15" y1="43" x2="128" y2="43" stroke="#cbd5e1" strokeWidth="1.5" />
                <polyline points="123,39 128,43 123,47" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
                <text x="131" y="46" fill="#cbd5e1" fontSize="10" fontFamily="monospace">x</text>

                <line x1="65" y1="80" x2="65" y2="8" stroke="#cbd5e1" strokeWidth="1.5" />
                <polyline points="61,13 65,8 69,13" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
                <text x="53" y="14" fill="#cbd5e1" fontSize="10" fontFamily="monospace">y</text>

                <path
                  d="M 20 65 Q 42 5, 65 43 T 115 22"
                  fill="none"
                  stroke="#61afef"
                  strokeWidth="2.2"
                />
              </svg>
            </div>

            {/* Block 4: Drawing Tools */}
            <div className="ribbon-group grid-3x2">
              <button
                className={`ribbon-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setActiveTool('select')}
              >
                <MousePointer size={20} />
                <span>Select</span>
              </button>
              <button
                className={`ribbon-btn ${activeTool === 'shapes' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTool('shapes');
                  setActiveSubmenu('shapes');
                }}
              >
                <Shapes size={20} />
                <span>Shapes</span>
              </button>
              <button
                className={`ribbon-btn ${activeTool === 'fill' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTool('fill');
                  setActiveSubmenu('home');
                }}
                title="Flood-fill a shape or closed area"
              >
                <FloodFillIcon />
                <span>Fill</span>
              </button>
              <button
                className={`ribbon-btn ${activeTool === 'pen' || activeTool === 'highlighter' ? 'active' : ''}`}
                onClick={() => {
                  if (activeTool !== 'highlighter') setActiveTool('pen');
                  setActiveSubmenu('pen');
                }}
              >
                <PenTool size={20} />
                <span>Pen</span>
              </button>
              <button
                className={`ribbon-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTool('eraser');
                  setActiveSubmenu('eraser');
                }}
              >
                <Eraser size={20} />
                <span>Eraser</span>
              </button>
              <button
                className={`ribbon-btn ${activeTool === 'laser' ? 'active' : ''}`}
                onClick={() => setActiveTool('laser')}
              >
                <Wand2 size={20} />
                <span>Laser Pointer</span>
              </button>
            </div>

            {/* Block 5: Session & Screen */}
            <div className="ribbon-group grid-3x2 session-tools-group">
              <button
                className={`ribbon-btn session-rec-btn ${recordingState === 'recording' ? 'rec-active' : ''}`}
                onClick={onStartRecording}
                disabled={recordingState !== 'idle'}
                title={recordingState === 'converting' ? 'Preparing MP4 export' : 'Start session recording'}
              >
                <span className="rec-dot" />
                <span>{recordingState === 'paused' ? 'PAUSED' : recordingState === 'converting' ? 'EXPORT' : 'REC'}</span>
              </button>
              <button className="ribbon-btn session-settings-btn">
                <Settings size={20} />
                <span>Settings</span>
              </button>
              {isPdfPage && (
                <button className="ribbon-btn session-present-btn" onClick={onPresent}>
                  <Presentation size={20} />
                  <span>Present</span>
                </button>
              )}
              <button className="ribbon-btn session-dock-btn" onClick={onToggleDock}>
                {isDocked ? <PanelTop size={20} /> : <PanelBottom size={20} />}
                <span>{isDocked ? 'Top Bar' : 'Dock'}</span>
              </button>
              <button className="ribbon-btn session-fullscreen-btn" onClick={onToggleFullscreen}>
                <Presentation size={20} />
                <span>Full screen</span>
              </button>
            </div>
          </div>
        )}

        {/* PEN & HIGHLIGHTER SUBMENU RIBBON (Matches Screenshot Overlay) */}
        {activeSubmenu === 'pen' && (
          <div className="tool-submenu-overlay">
            <button
              className="ribbon-group submenu-close-btn"
              onClick={() => setActiveSubmenu('home')}
              title="Back to Main Toolbar"
            >
              <X size={20} />
            </button>

            {/* Pen & Highlighter Selector */}
            <div className="ribbon-group pen-mode-group">
              <button
                className={`ribbon-btn large ${activeTool === 'pen' ? 'active' : ''}`}
                onClick={() => setActiveTool('pen')}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.862 3.487a2.1 2.1 0 0 1 2.97 2.97L8.5 17.79l-4.2.93.93-4.2L16.862 3.487Z" />
                </svg>
                <span>Pen</span>
              </button>
              <button
                className={`ribbon-btn large ${activeTool === 'highlighter' ? 'active' : ''}`}
                onClick={() => setActiveTool('highlighter')}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m15.2 4.2 4.6 4.6-9.4 9.4-3.8.8-2.4 2.4-1.4-1.4 2.4-2.4.8-3.8 9.2-9.6Z" />
                </svg>
                <span>Highlighter</span>
              </button>
              <button
                className={`ribbon-btn pressure-toggle-btn ${pressureEnabled ? '' : 'active'}`}
                onClick={() => setPressureEnabled(!pressureEnabled)}
                title={pressureEnabled ? 'Disable pressure sensitivity' : 'Enable pressure sensitivity'}
                aria-pressed={!pressureEnabled}
              >
                <span className="pressure-mark">P</span>
                <span>{pressureEnabled ? 'Pressure' : 'No pressure'}</span>
              </button>
            </div>

            {/* Magic Shape + Tapered Stroke Preview + Slider */}
            <div className="ribbon-group stroke-studio-group">
              <div className="stroke-studio-main">
                <button
                  className={`ribbon-btn magic-shape-btn ${magicInkEnabled ? 'active' : ''}`}
                  onClick={() => setMagicInkEnabled(!magicInkEnabled)}
                  title="Toggle Automatic Shape Recognition"
                >
                  <svg width="34" height="30" viewBox="0 0 36 30" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <line x1="4" y1="24" x2="16" y2="8" />
                    <path d="M9 4v4M7 6h4M15 3v3M13.5 4.5h3" strokeWidth="1.4" />
                    <polygon points="27,4 33,14 21,14" />
                    <rect x="22" y="18" width="10" height="9" />
                  </svg>
                  <span>Magic Shape</span>
                </button>

                <div className="stroke-slider-column">
                  <div className="stroke-preview-row">
                    <svg className="taper-wedge-svg" viewBox="0 0 120 18" preserveAspectRatio="none">
                      <polygon
                        points={`0,9 120,${Math.max(1, 9 - strokeWidth * 0.35)} 120,${Math.min(17, 9 + strokeWidth * 0.35)}`}
                        fill="#cbd5e1"
                      />
                    </svg>
                    <div className="px-readout-box">{strokeWidth}px</div>
                  </div>

                  <input
                    type="range"
                    className="studio-range-slider"
                    min={1}
                    max={24}
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="group-bottom-caption">Stroke</div>
            </div>

            {/* 2x5 Color Swatches + Rainbow Color Wheel */}
            <div className="ribbon-group colors-studio-group">
              <div className="colors-studio-main">
                <div className="swatch-grid-2x5">
                  {SWATCH_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch-square ${strokeColor.toLowerCase() === c.toLowerCase() ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setStrokeColor(c)}
                      title={c}
                    />
                  ))}
                </div>

                <button
                  className="edit-colors-btn"
                  onClick={() => colorInputRef.current?.click()}
                  title="Open Full Color Wheel"
                >
                  <div className="rainbow-wheel-circle">
                    <span className="wheel-plus-badge">+</span>
                  </div>
                  <span>Edit Colors</span>
                  <input
                    ref={colorInputRef}
                    type="color"
                    className="hidden-color-input"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                  />
                </button>
              </div>
              <div className="group-bottom-caption">Colors</div>
            </div>

            {/* Right Math Tools 2x2 */}
            {renderMathToolsBlock()}
          </div>
        )}

        {/* ERASER SUBMENU RIBBON */}
        {activeSubmenu === 'eraser' && (
          <div className="tool-submenu-overlay">
            <button
              className="ribbon-group submenu-close-btn"
              onClick={() => setActiveSubmenu('home')}
              title="Back to Main Toolbar"
            >
              <X size={20} />
            </button>

            <div className="ribbon-group pen-mode-group">
              <button
                className={`ribbon-btn large ${eraserMode === 'stroke' ? 'active' : ''}`}
                onClick={() => setEraserMode('stroke')}
              >
                <Eraser size={24} />
                <span>Tap / Drag</span>
              </button>
              <button
                className={`ribbon-btn large ${eraserMode === 'circle' ? 'active' : ''}`}
                onClick={() => setEraserMode('circle')}
              >
                <CircleDot size={24} />
                <span>Circle Erase</span>
              </button>
              <button
                className={`ribbon-btn large ${eraserMode === 'classic' ? 'active' : ''}`}
                onClick={() => setEraserMode('classic')}
                title="Erase only the stroke sections under the cursor"
              >
                <Eraser size={24} />
                <span>Classic Eraser</span>
              </button>
              <button className="ribbon-btn large danger-btn" onClick={onClearPage}>
                <Trash2 size={24} />
                <span>Clear Page</span>
              </button>
            </div>

            <div className="ribbon-group studio-info-box">
              <p>
                {eraserMode === 'circle'
                  ? 'Circle strokes or shapes, then tap the ✕ in the center to erase them.'
                  : eraserMode === 'classic'
                    ? 'Erase only the parts of a stroke beneath the brush; shapes touched by the cursor are removed.'
                    : 'Tap or drag across a stroke or shape to erase the whole object.'}
              </p>
            </div>
            <label className="eraser-size-control">
              <span>Classic eraser <strong>{eraserWidth}px</strong></span>
              <input
                type="range"
                min={8}
                max={96}
                step={2}
                value={eraserWidth}
                onChange={(event) => setEraserWidth(Number(event.target.value))}
                aria-label="Classic eraser diameter"
              />
              <span className="eraser-presets">
                {[12, 24, 48, 72].map((size) => (
                  <button
                    key={size}
                    className={eraserWidth === size ? 'active' : ''}
                    onClick={() => setEraserWidth(size)}
                    type="button"
                    title={`${size}px`}
                  >
                    {size}
                  </button>
                ))}
              </span>
            </label>

            {renderMathToolsBlock()}
          </div>
        )}

        {/* SHAPES & CARTESIAN SPACES SUBMENU RIBBON */}
        {activeSubmenu === 'shapes' && (
          <div className="tool-submenu-overlay">
            <button
              className="ribbon-group submenu-close-btn"
              onClick={() => setActiveSubmenu('home')}
              title="Back to Main Toolbar"
            >
              <X size={20} />
            </button>

            <div className="ribbon-group shapes-studio-group">
              <div className="shapes-studio-rows">
                <div className="shapes-row">
                  <button
                    className={`mini-pill ${!shapeFilled ? 'active' : ''}`}
                    onClick={() => setShapeFilled(false)}
                  >
                    Hollow
                  </button>
                  <button
                    className={`mini-pill ${shapeFilled ? 'active' : ''}`}
                    onClick={() => setShapeFilled(true)}
                  >
                    Filled
                  </button>
                  {BASIC_SHAPES.map((s) => (
                    <button
                      key={s.id}
                      className={`mini-pill shape-pill ${activeShape === s.id ? 'active' : ''}`}
                      onClick={() => setActiveShape(s.id)}
                      title={s.label}
                    >
                      <ShapePreviewIcon kind={s.id} />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>

                <div className="shapes-row">
                  <span className="row-tag">AXES:</span>
                  {MATH_AXES.map((ax) => (
                    <button
                      key={ax.id}
                      className={`mini-pill shape-pill axis-pill ${activeShape === ax.id ? 'active' : ''}`}
                      onClick={() => setActiveShape(ax.id)}
                      title={ax.label}
                    >
                      <ShapePreviewIcon kind={ax.id} />
                      {ax.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="shape-width-control">
                <span>Stroke thickness <strong>{strokeWidth}px</strong></span>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  aria-label="Shape stroke thickness"
                />
              </label>
              <div className="group-bottom-caption">Figures &amp; Cartesian Spaces</div>
            </div>

            {renderMathToolsBlock()}
          </div>
        )}
      </div>
    </header>
  );
};