import React from 'react';
import { Contrast, Eye, EyeOff, FileDown, Maximize2, Mic, MicOff, Moon, Pause, PenTool, Play, Square, Sun } from 'lucide-react';
import { PaperPattern, ToolType } from '../types/board';

interface StatusBarProps {
  mode: 'NORMAL' | 'DRAW' | 'PAN/ZOOM';
  activeTool: ToolType;
  pdfFileName: string;
  onPdfFileNameChange: (name: string) => void;
  onSavePdf: () => void;
  pageNumber: number;
  pageCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  colorInverted: boolean;
  onToggleColorInversion: () => void;
  recordingState: 'idle' | 'recording' | 'paused' | 'converting';
  microphoneEnabled: boolean;
  onStopRecording: () => void;
  onToggleMicrophone: () => void;
  onToggleRecordingPause: () => void;
  patternVisible: boolean;
  onTogglePattern: () => void;
  pattern: PaperPattern;
  onChangePattern: (pattern: PaperPattern) => void;
  zoom: number;
  onResetZoom: () => void;
  onFitPage: () => void;
  onFitWidth: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  activeTool,
  pdfFileName,
  onPdfFileNameChange,
  onSavePdf,
  pageNumber,
  pageCount,
  theme,
  onToggleTheme,
  colorInverted,
  onToggleColorInversion,
  recordingState,
  microphoneEnabled,
  onStopRecording,
  onToggleMicrophone,
  onToggleRecordingPause,
  patternVisible,
  onTogglePattern,
  pattern,
  onChangePattern,
  zoom,
  onResetZoom,
  onFitPage,
  onFitWidth,
}) => {
  return (
    <footer className="vim-statusbar">
      <div className="status-left">
        <span className={`vim-mode-badge mode-${mode.toLowerCase().replace('/', '-')}`}>
          {mode}
        </span>
        <span className="status-tool">
          <PenTool size={13} /> {activeTool.toUpperCase()}
        </span>
        <div className="status-pdf-name" title="PDF export filename">
          <FileDown size={14} />
          <input
            value={pdfFileName}
            onChange={(event) => onPdfFileNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSavePdf();
            }}
            aria-label="PDF filename"
            placeholder="PDF name"
          />
          <button type="button" onClick={onSavePdf} title="Export PDF">Save</button>
        </div>
      </div>

      <div className="status-right">
        <span className="status-page-info">PAGE {pageNumber} / {pageCount}</span>
        {recordingState === 'recording' || recordingState === 'paused' ? (
          <div className="recording-controls">
            <span className="recording-indicator">{recordingState === 'paused' ? 'PAUSED' : 'REC'}</span>
            <button className="status-toggle recording-stop" onClick={onStopRecording} title="Stop and export MP4">
              <Square size={13} /> STOP
            </button>
            <button className="status-toggle" onClick={onToggleMicrophone} title={microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'}>
              {microphoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}
              <span>{microphoneEnabled ? 'Mic On' : 'Mic Off'}</span>
            </button>
            <button className="status-toggle" onClick={onToggleRecordingPause} title={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'}>
              {recordingState === 'paused' ? <Play size={14} /> : <Pause size={14} />}
              <span>{recordingState === 'paused' ? 'Resume' : 'Pause'}</span>
            </button>
          </div>
        ) : recordingState === 'converting' ? (
          <span className="recording-converting">Converting video to MP4…</span>
        ) : null}
        <button
          className="status-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
        </button>
        <button
          className={`status-toggle ${colorInverted ? 'active' : ''}`}
          onClick={onToggleColorInversion}
          aria-pressed={colorInverted}
          title={colorInverted ? 'Restore page colors' : 'Invert page colors'}
        >
          <Contrast size={14} />
          <span>{colorInverted ? 'Normal board' : 'Invert board'}</span>
        </button>
        <button className="status-toggle" onClick={onTogglePattern} aria-pressed={patternVisible}>
          {patternVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>{patternVisible ? 'Pattern on' : 'Pattern off'}</span>
        </button>
        <label className="status-pattern-select">
          <span>Paper</span>
          <select
            value={pattern}
            onChange={(event) => onChangePattern(event.target.value as PaperPattern)}
            aria-label="Choose paper pattern"
          >
            <option value="blank">Blank</option>
            <option value="lined">Ruled</option>
            <option value="grid">Grid</option>
            <option value="small-grid">Small grid</option>
            <option value="dots">Dots</option>
            <option value="graph">Graph</option>
            <option value="staff">Music staff</option>
            <option value="isometric">Isometric</option>
          </select>
        </label>
        <button className="status-toggle" onClick={onFitPage} title="Fit the whole page">
          <Maximize2 size={14} />
          <span>Page</span>
        </button>
        <button className="status-toggle" onClick={onFitWidth} title="Fit page width">
          <span>Width</span>
        </button>
        <button className="status-toggle" onClick={onResetZoom} title="Click to reset zoom to 100%">
          Zoom: {Math.round(zoom * 100)}%
        </button>
      </div>
    </footer>
  );
};