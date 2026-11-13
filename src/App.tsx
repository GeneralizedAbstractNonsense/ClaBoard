import React, { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BoardGraph,
  BoardImage,
  BoardPage,
  BoardShape,
  EraserMode,
  GeometryToolKind,
  GeometryToolState,
  PageBackground as PageBackgroundData,
  PageGroup,
  PaperPattern,
  RibbonSubmenu,
  ShapeKind,
  Stroke,
  ToolType,
  Viewport,
} from './types/board';
import { TopBar } from './components/TopBar';
import { BoardCanvas } from './components/BoardCanvas';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { GraphDialog } from './components/GraphDialog';
import { GraphRenderer } from './components/GraphRenderer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { PageBackground } from './components/PageBackground';
import { BoardImageRenderer } from './components/BoardImageRenderer';
import { ScientificCalculator } from './components/ScientificCalculator';
import { PresentationView } from './components/PresentationView';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ffmpegCoreJsUrl from '@ffmpeg/core?url';
import ffmpegCoreWasmUrl from '@ffmpeg/core/wasm?url';
import { getSvgPathFromPoints } from './utils/strokeUtils';
import './App.css';

function formatNow(): string {
  const now = new Date();
  return (
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' - ' +
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

export function App() {
  const [pages, setPages] = useState<BoardPage[]>([
    {
      id: 'page-1',
      number: 1,
      title: '',
      subtitle: '',
      createdAt: formatNow(),
      width: 1200,
      height: 1400,
      background: { color: '#ffffff', pattern: 'blank' },
      strokes: [],
      shapes: [],
      graphs: [],
    },
  ]);
  const [pageGroups, setPageGroups] = useState<PageGroup[]>([]);
  const [livePreview, setLivePreview] = useState<{
    pageId: string;
    stroke: Stroke | null;
    shape: BoardShape | null;
  } | null>(null);

  const [activePageId, setActivePageId] = useState<string>('page-1');
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [activeSubmenu, setActiveSubmenu] = useState<RibbonSubmenu>('pen');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  const [strokeColor, setStrokeColor] = useState<string>('#1e293b');
  const [isDocked, setIsDocked] = useState(false);
  const [isSidebarLeft, setIsSidebarLeft] = useState(false);
  const [graphDialogOpen, setGraphDialogOpen] = useState(false);
  const [magicInkEnabled, setMagicInkEnabled] = useState<boolean>(false);
  const [eraserMode, setEraserMode] = useState<EraserMode>('stroke');
  const [eraserWidth, setEraserWidth] = useState(24);
  const [activeShape, setActiveShape] = useState<ShapeKind>('cartesian-2d-metered');
  const [shapeFilled, setShapeFilled] = useState<boolean>(false);
  const [colorInverted, setColorInverted] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [geometryTool, setGeometryTool] = useState<GeometryToolState | null>(null);
  const [presentation, setPresentation] = useState<{ groupId: string; initialPageId: string } | null>(null);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'converting'>('idle');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('claboard-board');

  const [patternVisible, setPatternVisible] = useState<boolean>(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [interactionMode, setInteractionMode] = useState<'NORMAL' | 'DRAW' | 'PAN/ZOOM'>('NORMAL');

  const [undoStack, setUndoStack] = useState<BoardPage[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardPage[][]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamsRef = useRef<MediaStream[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const captureLoopRef = useRef<{ cancelled: boolean; timeout: number | null } | null>(null);
  const recordingFailureRef = useRef<string | null>(null);
  const recordingStartRef = useRef(false);

  const activePage = pages.find((p) => p.id === activePageId) || pages[0];
  const activePageIndex = pages.findIndex((page) => page.id === activePage.id);
  useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    window.addEventListener('wheel', preventBrowserZoom, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', preventBrowserZoom, true);
  }, []);

  useEffect(() => {
    if (pageGroups.some((group) => group.id === activePage.groupId && group.type === 'pdf')) {
      setActiveSubmenu('home');
    }
  }, [activePage.groupId, pageGroups]);

  const finalizeRecording = async (mimeType: string) => {
    setRecordingState('converting');
    const loop = captureLoopRef.current;
    if (loop) {
      loop.cancelled = true;
      if (loop.timeout !== null) window.clearTimeout(loop.timeout);
      captureLoopRef.current = null;
    }
    recordingStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    recordingStreamsRef.current = [];
    microphoneSourceRef.current?.disconnect();
    microphoneSourceRef.current = null;
    microphoneStreamRef.current = null;
    recordingAudioDestinationRef.current = null;
    if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== 'closed') {
      void recordingAudioContextRef.current.close();
    }
    recordingAudioContextRef.current = null;
    recorderRef.current = null;

    try {
      if (recordingFailureRef.current) throw new Error(recordingFailureRef.current);
      const capture = new Blob(recordingChunksRef.current, { type: mimeType });
      recordingChunksRef.current = [];
      if (capture.size === 0) throw new Error('The recording is empty.');

      let output = capture;
      if (!mimeType.startsWith('video/mp4')) {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const ffmpeg = new FFmpeg();
        try {
          await ffmpeg.load({ coreURL: ffmpegCoreJsUrl, wasmURL: ffmpegCoreWasmUrl });
          await ffmpeg.writeFile('session.webm', new Uint8Array(await capture.arrayBuffer()));
          const exitCode = await ffmpeg.exec([
            '-i', 'session.webm',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '25',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            'session.mp4',
          ]);
          if (exitCode !== 0) throw new Error('The MP4 encoder could not convert this recording.');
          const encoded = await ffmpeg.readFile('session.mp4');
          if (typeof encoded === 'string') throw new Error('The MP4 encoder returned invalid video data.');
          const mp4Buffer = new ArrayBuffer(encoded.byteLength);
          new Uint8Array(mp4Buffer).set(encoded);
          output = new Blob([mp4Buffer], { type: 'video/mp4' });
        } finally {
          ffmpeg.terminate();
        }
      }

      const url = URL.createObjectURL(output);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `claboard-session-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Session recording export failed', error);
      window.alert(error instanceof Error ? error.message : 'Session recording export failed.');
    } finally {
      recordingFailureRef.current = null;
      setRecordingState('idle');
      setMicrophoneEnabled(false);
    }
  };

  const startRecording = async () => {
    if (recordingState !== 'idle' || recordingStartRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      window.alert('Video recording is not supported by this browser.');
      return;
    }
    const target = window.document.querySelector<HTMLElement>('.claboard-app');
    if (!target) {
      window.alert('The board is not available for recording.');
      return;
    }

    recordingStartRef.current = true;
    let audioStream: MediaStream | null = null;
    let canvasStream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices?.getUserMedia && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (devices.some((device) => device.kind === 'audioinput')) {
            try {
              audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (error) {
              console.warn('Microphone unavailable; starting canvas-only recording.', error);
            }
          } else {
            console.info('No microphone detected; starting canvas-only recording.');
          }
        } catch (error) {
          console.warn('Could not enumerate microphones; starting canvas-only recording.', error);
        }
      }

      const { default: html2canvas } = await import('html2canvas');
      const targetWidth = Math.max(1, target.clientWidth);
      const targetHeight = Math.max(1, target.clientHeight);
      const scale = Math.min(1, 1280 / targetWidth, 720 / targetHeight);
      const captureCanvas = window.document.createElement('canvas');
      captureCanvas.width = Math.max(1, Math.round(targetWidth * scale));
      captureCanvas.height = Math.max(1, Math.round(targetHeight * scale));
      const context = captureCanvas.getContext('2d');
      if (!context) throw new Error('Canvas recording is unavailable.');

      const drawFrame = async () => {
        const snapshot = await html2canvas(target, {
          backgroundColor: '#14171f',
          logging: false,
          scale,
          useCORS: true,
        });
        context.drawImage(snapshot, 0, 0, captureCanvas.width, captureCanvas.height);
      };
      await drawFrame();
      if (typeof captureCanvas.captureStream !== 'function') {
        throw new Error('Canvas stream capture is not supported by this browser.');
      }
      canvasStream = captureCanvas.captureStream(12);
      let audioTracks = audioStream?.getAudioTracks() ?? [];
      let audioDestination: MediaStreamAudioDestinationNode | null = null;
      try {
        if (typeof window.AudioContext !== 'undefined') {
          const audioContext = new window.AudioContext();
          audioDestination = audioContext.createMediaStreamDestination();
          if (audioStream) {
            microphoneSourceRef.current = audioContext.createMediaStreamSource(audioStream);
            microphoneSourceRef.current.connect(audioDestination);
          }
          recordingAudioContextRef.current = audioContext;
          recordingAudioDestinationRef.current = audioDestination;
          await audioContext.resume();
          audioTracks = audioDestination.stream.getAudioTracks();
        }
      } catch (error) {
        console.warn('Could not initialize microphone mixing; continuing with available tracks.', error);
        microphoneSourceRef.current?.disconnect();
        microphoneSourceRef.current = null;
        if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== 'closed') {
          void recordingAudioContextRef.current.close();
        }
        recordingAudioContextRef.current = null;
        recordingAudioDestinationRef.current = null;
        audioDestination = null;
        audioTracks = audioStream?.getAudioTracks() ?? [];
      }
      microphoneStreamRef.current = audioStream;
      const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
      const mp4Type = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const webmType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const mimeType = mp4Type ?? webmType;
      if (!mimeType) throw new Error('This browser cannot record a supported video format.');

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
      recordingChunksRef.current = [];
      recordingFailureRef.current = null;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => { void finalizeRecording(recorder.mimeType); };
      recorder.onerror = () => {
        recordingFailureRef.current = 'The browser encountered an error while recording.';
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorderRef.current = recorder;
      recordingStreamsRef.current = [
        canvasStream,
        ...(audioStream ? [audioStream] : []),
        ...(audioDestination ? [audioDestination.stream] : []),
      ];
      setMicrophoneEnabled(Boolean(audioStream?.getAudioTracks().some((track) => track.readyState === 'live')));
      setRecordingState('recording');
      recorder.start(1000);

      const loop = { cancelled: false, timeout: null as number | null };
      captureLoopRef.current = loop;
      const captureNextFrame = async () => {
        if (loop.cancelled) return;
        try {
          await drawFrame();
          if (!loop.cancelled) loop.timeout = window.setTimeout(() => { void captureNextFrame(); }, 80);
        } catch (error) {
          recordingFailureRef.current = error instanceof Error ? error.message : 'Canvas capture failed.';
          stopRecording();
        }
      };
      loop.timeout = window.setTimeout(() => { void captureNextFrame(); }, 80);
    } catch (error) {
      audioStream?.getTracks().forEach((track) => track.stop());
      canvasStream?.getTracks().forEach((track) => track.stop());
      microphoneSourceRef.current?.disconnect();
      microphoneSourceRef.current = null;
      microphoneStreamRef.current = null;
      recordingAudioDestinationRef.current = null;
      if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== 'closed') {
        void recordingAudioContextRef.current.close();
      }
      recordingAudioContextRef.current = null;
      recorderRef.current = null;
      recordingStreamsRef.current = [];
      console.error('Session recording could not start', error);
      window.alert(error instanceof Error ? error.message : 'Session recording could not start.');
      setRecordingState('idle');
    } finally {
      recordingStartRef.current = false;
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const toggleRecordingPause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setRecordingState('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setRecordingState('recording');
    }
  };

  const toggleMicrophone = async () => {
    const audioTracks = microphoneStreamRef.current?.getAudioTracks() ?? [];
    if (audioTracks.length > 0) {
      const nextEnabled = !microphoneEnabled;
      audioTracks.forEach((track) => { track.enabled = nextEnabled; });
      setMicrophoneEnabled(nextEnabled);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert('Microphone access is not available; the canvas recording will continue without audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = recordingAudioContextRef.current;
      const destination = recordingAudioDestinationRef.current;
      if (!audioContext || !destination) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('This browser cannot add a microphone to an active recording.');
      }
      microphoneSourceRef.current?.disconnect();
      microphoneSourceRef.current = audioContext.createMediaStreamSource(stream);
      microphoneSourceRef.current.connect(destination);
      microphoneStreamRef.current = stream;
      recordingStreamsRef.current.push(stream);
      setMicrophoneEnabled(true);
    } catch (error) {
      console.warn('Microphone could not be enabled; the canvas recording continues.', error);
      setMicrophoneEnabled(false);
      window.alert(error instanceof Error
        ? `${error.message} The canvas recording will continue without audio.`
        : 'Microphone access failed; the canvas recording will continue without audio.');
    }
  };

  const handleLivePreview = useCallback((stroke: Stroke | null, shape: BoardShape | null) => {
    setLivePreview(stroke || shape ? { pageId: activePage.id, stroke, shape } : null);
  }, [activePage.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (presentation) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      } else if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        handleClonePages([activePage.id]);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        if (activePageIndex > 0) setActivePageId(pages[activePageIndex - 1].id);
      } else if (event.key === 'PageDown') {
        event.preventDefault();
        if (activePageIndex < pages.length - 1) setActivePageId(pages[activePageIndex + 1].id);
      } else if (event.key === 'Delete' && !(target?.closest('.board-svg'))) {
        event.preventDefault();
        handleDeletePages([activePage.id]);
      } else if (
        target?.closest('.pages-sidebar') &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) {
        event.preventDefault();
        const nextIndex = Math.max(0, Math.min(
          pages.length - 1,
          activePageIndex + (event.key === 'ArrowDown' ? 1 : -1),
        ));
        setActivePageId(pages[nextIndex].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePage.id, activePageIndex, pages, presentation]);

  const pushHistory = (currentPages: BoardPage[]) => {
    setUndoStack((prev) => [...prev.slice(-25), currentPages]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, pages]);
    setUndoStack((prev) => prev.slice(0, -1));
    setPages(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, pages]);
    setRedoStack((prev) => prev.slice(0, -1));
    setPages(next);
  };

  const handleAddStroke = (stroke: Stroke) => {
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, strokes: [...p.strokes, stroke] } : p))
    );
  };

  const handleAddShape = (shape: BoardShape) => {
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, shapes: [...p.shapes, shape] } : p))
    );
  };

  const handleFillShape = (shapeId: string, fillColor: string) => {
    const shape = activePage.shapes.find((item) => item.id === shapeId);
    if (!shape || (shape.filled && shape.fillColor === fillColor)) return;
    pushHistory(pages);
    setPages((prev) => prev.map((page) => page.id === activePage.id
      ? {
          ...page,
          shapes: page.shapes.map((item) => item.id === shapeId
            ? { ...item, filled: true, fillColor }
            : item),
        }
      : page));
  };

  const handleEraseStroke = (strokeId: string) => {
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? { ...p, strokes: p.strokes.filter((s) => s.id !== strokeId) }
          : p
      )
    );
  };

  const handleEraseShape = (shapeId: string) => {
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? { ...p, shapes: p.shapes.filter((sh) => sh.id !== shapeId) }
          : p
      )
    );
  };

  const handleBulkErase = (strokeIds: string[], shapeIds: string[]) => {
    pushHistory(pages);
    const sSet = new Set(strokeIds);
    const shSet = new Set(shapeIds);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: p.strokes.filter((s) => !sSet.has(s.id)),
              shapes: p.shapes.filter((sh) => !shSet.has(sh.id)),
            }
          : p
      )
    );
  };

  const handleClassicErase = (
    removedStrokeIds: string[],
    replacementStrokes: Stroke[],
    shapeIds: string[]
  ) => {
    if (removedStrokeIds.length === 0 && replacementStrokes.length === 0 && shapeIds.length === 0) {
      return;
    }

    pushHistory(pages);
    const strokeIdSet = new Set(removedStrokeIds);
    const shapeIdSet = new Set(shapeIds);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: [
                ...p.strokes.filter((stroke) => !strokeIdSet.has(stroke.id)),
                ...replacementStrokes,
              ],
              shapes: p.shapes.filter((shape) => !shapeIdSet.has(shape.id)),
            }
          : p
      )
    );
  };

  const handleClearPage = () => {
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, strokes: [], shapes: [], graphs: [], images: [] } : p))
    );
  };

  const handleExtendPage = (height: number) => {
    if (activePage.height >= height) return;
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id && p.height < height ? { ...p, height } : p))
    );
  };

  const handleOpenGeometryTool = (kind: GeometryToolKind) => {
    setGeometryTool((current) => current?.kind === kind ? null : {
      kind,
      x: kind === 'ruler' ? 220 : kind === 'protractor' ? 520 : 650,
      y: kind === 'ruler' ? 280 : 420,
      angle: 0,
      size: kind === 'ruler' ? 420 : kind === 'protractor' ? 240 : 150,
      armAngle: 45,
    });
  };

  const handleImportPdf = async (file: File) => {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const groupId = crypto.randomUUID();
      const baseName = file.name.replace(/\.pdf$/i, '') || 'Imported PDF';
      const importedPages: BoardPage[] = [];

      for (let index = 1; index <= document.numPages; index++) {
        const pdfPage = await document.getPage(index);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const deviceScale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
        const maxDimensionScale = Math.min(8000 / baseViewport.width, 8000 / baseViewport.height);
        const renderScale = Math.min(deviceScale, maxDimensionScale);
        const viewport = pdfPage.getViewport({ scale: renderScale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable for PDF rendering.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        importedPages.push({
          id: `page-${crypto.randomUUID()}`,
          number: pages.length + index,
          title: `Slide ${index}`,
          subtitle: '',
          createdAt: formatNow(),
          width: baseViewport.width,
          height: baseViewport.height,
          imageQualityScale: renderScale,
          background: {
            color: '#ffffff',
            imageData: canvas.toDataURL('image/png'),
            pattern: 'blank',
          },
          groupId,
          strokes: [],
          shapes: [],
          graphs: [],
          images: [],
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      if (importedPages.length === 0) throw new Error('The PDF contains no pages.');
      pushHistory(pages);
      setPageGroups((current) => [...current, {
        id: groupId,
        name: baseName,
        collapsed: false,
        type: 'pdf',
        sourceFile: file.name,
      }]);
      setPages(renumberPages([...pages, ...importedPages]));
      setActivePageId(importedPages[0].id);
      setViewport({ x: 0, y: 0, zoom: 1 });
    } catch (error) {
      console.error('PDF import failed', error);
      window.alert(error instanceof Error ? error.message : 'PDF import failed.');
    }
  };

  const handleStartPresentation = () => {
    if (!activePage.groupId) return;
    const group = pageGroups.find((item) => item.id === activePage.groupId && item.type === 'pdf');
    if (group) setPresentation({ groupId: group.id, initialPageId: activePage.id });
  };

  const handleAddGraph = (dimension: '2d' | '3d', expression: string) => {
    const graph: BoardGraph = {
      id: crypto.randomUUID(),
      dimension,
      expression,
      x: 100,
      y: 180,
      width: 480,
      height: 330,
      zoom: 1,
      panX: 0,
      panY: 0,
    };
    pushHistory(pages);
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, graphs: [...p.graphs, graph] } : p))
    );
    setGraphDialogOpen(false);
    setActiveTool('select');
  };

  const handleImportImage = async (file: File) => {
    if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name)) {
      window.alert('Choose an image file to place on the board.');
      return;
    }
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('The image could not be read.'));
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({
          width: image.naturalWidth || 640,
          height: image.naturalHeight || 480,
        });
        image.onerror = () => reject(new Error('The selected image format could not be decoded.'));
        image.src = imageData;
      });
      const scale = Math.min(1, 640 / dimensions.width, 480 / dimensions.height);
      const width = Math.max(1, dimensions.width * scale);
      const height = Math.max(1, dimensions.height * scale);
      const boardImage: BoardImage = {
        id: crypto.randomUUID(),
        name: file.name,
        imageData,
        x: (activePage.width - width) / 2,
        y: Math.max(24, (activePage.height - height) / 2),
        width,
        height,
        rotation: 0,
      };
      pushHistory(pages);
      setPages((current) => current.map((page) => page.id === activePage.id
        ? { ...page, images: [...(page.images ?? []), boardImage] }
        : page));
      setActiveTool('select');
      setActiveSubmenu('home');
    } catch (error) {
      console.error('Image import failed', error);
      window.alert(error instanceof Error ? error.message : 'Image import failed.');
    }
  };

  const handleUpdateImage = (image: BoardImage) => {
    const currentImage = activePage.images?.find((item) => item.id === image.id);
    if (!currentImage || (
      currentImage.x === image.x &&
      currentImage.y === image.y &&
      currentImage.width === image.width &&
      currentImage.height === image.height &&
      currentImage.rotation === image.rotation
    )) return;
    pushHistory(pages);
    setPages((current) => current.map((page) => page.id === activePage.id
      ? { ...page, images: (page.images ?? []).map((item) => item.id === image.id ? image : item) }
      : page));
  };

  const handleUpdateGraph = (graph: BoardGraph) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? { ...p, graphs: p.graphs.map((item) => (item.id === graph.id ? graph : item)) }
          : p
      )
    );
  };

  const handleMoveItems = (ids: string[], dx: number, dy: number) => {
    if (Math.hypot(dx, dy) < 0.5) return;
    pushHistory(pages);
    const selected = new Set(ids);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: p.strokes.map((stroke) =>
                selected.has(stroke.id)
                  ? {
                      ...stroke,
                      points: stroke.points.map((point) => ({
                        ...point,
                        x: point.x + dx,
                        y: point.y + dy,
                      })),
                    }
                  : stroke
              ),
              shapes: p.shapes.map((shape) =>
                selected.has(shape.id)
                  ? {
                      ...shape,
                      x1: shape.x1 + dx,
                      y1: shape.y1 + dy,
                      x2: shape.x2 + dx,
                      y2: shape.y2 + dy,
                      points: shape.points?.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
                    }
                  : shape
              ),
              graphs: p.graphs.map((graph) =>
                selected.has(graph.id) ? { ...graph, x: graph.x + dx, y: graph.y + dy } : graph
              ),
              images: (p.images ?? []).map((image) =>
                selected.has(image.id) ? { ...image, x: image.x + dx, y: image.y + dy } : image
              ),
            }
          : p
      )
    );
  };

  const handleGroupItems = (ids: string[], groupId: string) => {
    if (ids.length < 2) return;
    pushHistory(pages);
    const selected = new Set(ids);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: p.strokes.map((item) => selected.has(item.id) ? { ...item, groupId } : item),
              shapes: p.shapes.map((item) => selected.has(item.id) ? { ...item, groupId } : item),
              graphs: p.graphs.map((item) => selected.has(item.id) ? { ...item, groupId } : item),
              images: (p.images ?? []).map((item) => selected.has(item.id) ? { ...item, groupId } : item),
            }
          : p
      )
    );
  };

  const handleUngroupItems = (ids: string[]) => {
    pushHistory(pages);
    const selected = new Set(ids);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: p.strokes.map((item) => selected.has(item.id) ? { ...item, groupId: undefined } : item),
              shapes: p.shapes.map((item) => selected.has(item.id) ? { ...item, groupId: undefined } : item),
              graphs: p.graphs.map((item) => selected.has(item.id) ? { ...item, groupId: undefined } : item),
              images: (p.images ?? []).map((item) => selected.has(item.id) ? { ...item, groupId: undefined } : item),
            }
          : p
      )
    );
  };

  const handleDeleteItems = (ids: string[]) => {
    if (ids.length === 0) return;
    pushHistory(pages);
    const selected = new Set(ids);
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? {
              ...p,
              strokes: p.strokes.filter((item) => !selected.has(item.id)),
              shapes: p.shapes.filter((item) => !selected.has(item.id)),
              graphs: p.graphs.filter((item) => !selected.has(item.id)),
              images: (p.images ?? []).filter((item) => !selected.has(item.id)),
            }
          : p
      )
    );
  };

  const handleSavePdf = async () => {
    const fileName = pdfFileName.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
    if (!fileName) {
      window.alert('Please enter a valid file name.');
      return;
    }

    try {
      const [{ jsPDF }, { compile }] = await Promise.all([
        import('jspdf'),
        import('mathjs'),
      ]);
      const firstPageOrientation = pages[0].width >= pages[0].height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation: firstPageOrientation, unit: 'pt', format: 'a4' });

      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const orientation = page.width >= page.height ? 'landscape' : 'portrait';
        const rasterScale = Math.min(2, 4000 / page.width, 6000 / page.height);
        const svg = renderToStaticMarkup(
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${page.width} ${page.height}`}
            width={Math.round(page.width * rasterScale)}
            height={Math.round(page.height * rasterScale)}
          >
            <PageBackground
              id={`pdf-${page.id}`}
              width={page.width}
              height={page.height}
              background={page.background}
              patternVisible={patternVisible}
            />
            {page.title && (
              <text x={60} y={80} fill="#1e293b" fontSize={32} fontFamily="sans-serif">
                {page.title}
              </text>
            )}
            {page.subtitle && (
              <text x={60} y={116} fill="#64748b" fontSize={24} fontFamily="sans-serif">
                {page.subtitle}
              </text>
            )}
            {page.strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={getSvgPathFromPoints(stroke.points, stroke.size, stroke.pressureSensitive ?? true)}
                fill={stroke.color}
                opacity={stroke.tool === 'highlighter' ? 0.36 : 1}
              />
            ))}
            {page.images?.map((image) => (
            <BoardImageRenderer key={image.id} image={image} />
            ))}
            {page.shapes.map((shape) => <ShapeRenderer key={shape.id} shape={shape} />)}
            {page.graphs.map((graph) => {
              const compiled = compile(graph.expression);
              return (
                <GraphRenderer
                  key={graph.id}
                  graph={graph}
                  activeTool="select"
                  canvasZoom={1}
                  onChange={() => undefined}
                  evaluator={(x, y) => {
                    try {
                      const result = Number(compiled.evaluate({ x, y }));
                      return Number.isFinite(result) ? result : null;
                    } catch {
                      return null;
                    }
                  }}
                />
              );
            })}
          </svg>
        );

        const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const image = new Image();
        try {
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Could not render page ${page.number} for PDF export.`));
            image.src = imageUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(page.width * rasterScale);
          canvas.height = Math.round(page.height * rasterScale);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is unavailable for PDF export.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          if (index > 0) pdf.addPage('a4', orientation);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 24;
          const ratio = Math.min(
            (pageWidth - margin * 2) / canvas.width,
            (pageHeight - margin * 2) / canvas.height
          );
          const outputWidth = canvas.width * ratio;
          const outputHeight = canvas.height * ratio;
          pdf.addImage(
            canvas.toDataURL('image/png'),
            'PNG',
            (pageWidth - outputWidth) / 2,
            (pageHeight - outputHeight) / 2,
            outputWidth,
            outputHeight,
            undefined,
            'FAST'
          );
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      }

      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('PDF export failed', error);
      window.alert(error instanceof Error ? error.message : 'PDF export failed.');
    }
  };

  const handleNewPage = () => {
    pushHistory(pages);
    const newPage = makeBlankPage(pages.length + 1);
    setPages([...pages, newPage]);
    setActivePageId(newPage.id);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const handleDeletePage = () => {
    handleDeletePages([activePage.id]);
  };

  const handlePrevPage = () => {
    const idx = pages.findIndex((p) => p.id === activePage.id);
    if (idx > 0) setActivePageId(pages[idx - 1].id);
  };

  const handleNextPage = () => {
    const idx = pages.findIndex((p) => p.id === activePage.id);
    if (idx < pages.length - 1) setActivePageId(pages[idx + 1].id);
  };

  const handleUpdatePageHeader = (title: string, subtitle: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, title, subtitle } : p))
    );
  };

  const makeBlankPage = (number: number): BoardPage => ({
    id: `page-${crypto.randomUUID()}`,
    number,
    title: '',
    subtitle: '',
    createdAt: formatNow(),
    width: 1200,
    height: 1400,
    background: { color: '#ffffff', pattern: 'grid' },
    strokes: [],
    shapes: [],
    graphs: [],
    images: [],
  });

  const renumberPages = (items: BoardPage[]) => items.map((page, index) => ({ ...page, number: index + 1 }));

  const handleRenamePage = (id: string, title: string) => {
    pushHistory(pages);
    setPages((current) => current.map((page) => page.id === id ? { ...page, title } : page));
  };

  const handleUpdateBackground = (id: string, background: PageBackgroundData) => {
    pushHistory(pages);
    setPages((current) => current.map((page) => page.id === id ? { ...page, background } : page));
  };

  const handleToggleScreenShade = (id: string, orientation: 'horizontal' | 'vertical' = 'horizontal') => {
    pushHistory(pages);
    setPages((current) => current.map((page) => page.id === id
      ? {
          ...page,
            screenShade: page.screenShade
              ? (page.screenShade.orientation ?? 'horizontal') === orientation
                ? undefined
                : { ...page.screenShade, orientation }
              : { reveal: 0.5, orientation },
        }
      : page));
  };

  const handleUpdateScreenShade = (reveal?: number) => {
    setPages((current) => current.map((page) => page.id === activePage.id
      ? {
          ...page,
          screenShade: reveal === undefined
            ? undefined
            : { ...page.screenShade, reveal },
        }
      : page));
  };

  const handleInsertPageAfter = (id: string) => {
    pushHistory(pages);
    const index = pages.findIndex((page) => page.id === id);
    const newPage = makeBlankPage(pages.length + 1);
    const nextPages = [...pages];
    nextPages.splice(index + 1, 0, newPage);
    setPages(renumberPages(nextPages));
    setActivePageId(newPage.id);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const handleClonePages = (ids: string[]) => {
    const selected = new Set(ids);
    const sourcePages = pages.filter((page) => selected.has(page.id));
    if (sourcePages.length === 0) return;
    pushHistory(pages);
    const clones = sourcePages.map((page) => {
      const groupIds = new Set([
        ...page.strokes.map((item) => item.groupId).filter((value): value is string => Boolean(value)),
        ...page.shapes.map((item) => item.groupId).filter((value): value is string => Boolean(value)),
        ...page.graphs.map((item) => item.groupId).filter((value): value is string => Boolean(value)),
        ...(page.images ?? []).map((item) => item.groupId).filter((value): value is string => Boolean(value)),
      ]);
      const remappedGroups = new Map([...groupIds].map((groupId) => [groupId, crypto.randomUUID()]));
      return {
        ...page,
        id: `page-${crypto.randomUUID()}`,
        strokes: page.strokes.map((item) => ({ ...item, id: crypto.randomUUID(), groupId: item.groupId ? remappedGroups.get(item.groupId) : undefined })),
        shapes: page.shapes.map((item) => ({ ...item, id: crypto.randomUUID(), groupId: item.groupId ? remappedGroups.get(item.groupId) : undefined })),
        graphs: page.graphs.map((item) => ({ ...item, id: crypto.randomUUID(), groupId: item.groupId ? remappedGroups.get(item.groupId) : undefined })),
        images: (page.images ?? []).map((item) => ({ ...item, id: crypto.randomUUID(), groupId: item.groupId ? remappedGroups.get(item.groupId) : undefined })),
      };
    });
    const nextPages: BoardPage[] = [];
    for (const page of pages) {
      nextPages.push(page);
      if (selected.has(page.id)) nextPages.push(clones[sourcePages.findIndex((source) => source.id === page.id)]);
    }
    setPages(renumberPages(nextPages));
    setActivePageId(clones[clones.length - 1].id);
  };

  const handleDeletePages = (ids: string[]) => {
    const deleteSet = new Set(ids);
    const remaining = pages.filter((page) => !deleteSet.has(page.id));
    if (remaining.length === 0) {
      pushHistory(pages);
      const keepPage = pages.find((page) => page.id === activePage.id) ?? pages[0];
      setPages([{
        ...keepPage,
        number: 1,
        title: '',
        subtitle: '',
        strokes: [],
        shapes: [],
        graphs: [],
        images: [],
        screenShade: undefined,
      }]);
      setActivePageId(keepPage.id);
      return;
    }
    const firstDeletedIndex = pages.findIndex((page) => deleteSet.has(page.id));
    pushHistory(pages);
    setPages(renumberPages(remaining));
    if (deleteSet.has(activePage.id)) {
      setActivePageId(remaining[Math.min(firstDeletedIndex, remaining.length - 1)].id);
    }
  };

  const handleReorderPages = (
    ids: string[],
    targetId: string,
    position: 'before' | 'after',
  ) => {
    const movingIds = new Set(ids);
    if (movingIds.has(targetId)) return;
    const moving = pages.filter((page) => movingIds.has(page.id));
    if (moving.length === 0) return;
    const remaining = pages.filter((page) => !movingIds.has(page.id));
    const targetIndex = remaining.findIndex((page) => page.id === targetId);
    if (targetIndex < 0) return;
    const targetGroupId = remaining[targetIndex].groupId;
    const insertionIndex = targetIndex + (position === 'after' ? 1 : 0);
    const reordered = [...remaining];
    reordered.splice(insertionIndex, 0, ...moving.map((page) => ({ ...page, groupId: targetGroupId })));
    pushHistory(pages);
    setPages(renumberPages(reordered));
  };

  const handleCreateGroup = () => {
    const group: PageGroup = {
      id: crypto.randomUUID(),
      name: `Group ${pageGroups.length + 1}`,
      collapsed: false,
    };
    setPageGroups((current) => [...current, group]);
    handleUpdatePageGroup([activePage.id], group.id);
  };

  const handleUpdatePageGroup = (ids: string[], groupId?: string) => {
    const selected = new Set(ids);
    pushHistory(pages);
    setPages((current) => current.map((page) => selected.has(page.id) ? { ...page, groupId } : page));
  };

  const handleRenameGroup = useCallback((id: string, name: string) => {
    setPageGroups((current) => current.map((group) => group.id === id ? { ...group, name } : group));
  }, []);

  const handleToggleGroup = useCallback((id: string) => {
    setPageGroups((current) => current.map((group) => group.id === id ? { ...group, collapsed: !group.collapsed } : group));
  }, []);

  const handleDropItems = (ids: string[], targetPageId: string, copy: boolean) => {
    const sourcePage = pages.find((page) => page.id === activePage.id);
    const targetPage = pages.find((page) => page.id === targetPageId);
    if (!sourcePage || !targetPage || sourcePage.id === targetPage.id) return;
    const selected = new Set(ids);
    const sourceStrokes = sourcePage.strokes.filter((item) => selected.has(item.id));
    const sourceShapes = sourcePage.shapes.filter((item) => selected.has(item.id));
    const sourceGraphs = sourcePage.graphs.filter((item) => selected.has(item.id));
    const sourceImages = (sourcePage.images ?? []).filter((item) => selected.has(item.id));
    if (!sourceStrokes.length && !sourceShapes.length && !sourceGraphs.length && !sourceImages.length) return;
    pushHistory(pages);
    const remapGroupIds = new Map<string, string>();
    const cloneGroup = (groupId?: string) => {
      if (!groupId || !copy) return groupId;
      if (!remapGroupIds.has(groupId)) remapGroupIds.set(groupId, crypto.randomUUID());
      return remapGroupIds.get(groupId);
    };
    const movedStrokes = sourceStrokes.map((item) => copy
      ? { ...item, id: crypto.randomUUID(), groupId: cloneGroup(item.groupId) }
      : item);
    const movedShapes = sourceShapes.map((item) => copy
      ? { ...item, id: crypto.randomUUID(), groupId: cloneGroup(item.groupId) }
      : item);
    const movedGraphs = sourceGraphs.map((item) => copy
      ? { ...item, id: crypto.randomUUID(), groupId: cloneGroup(item.groupId) }
      : item);
    const movedImages = sourceImages.map((item) => copy
      ? { ...item, id: crypto.randomUUID(), groupId: cloneGroup(item.groupId) }
      : item);
    setPages((current) => current.map((page) => {
      if (page.id === sourcePage.id && !copy) {
        return {
          ...page,
          strokes: page.strokes.filter((item) => !selected.has(item.id)),
          shapes: page.shapes.filter((item) => !selected.has(item.id)),
          graphs: page.graphs.filter((item) => !selected.has(item.id)),
          images: (page.images ?? []).filter((item) => !selected.has(item.id)),
        };
      }
      if (page.id === targetPage.id) {
        return {
          ...page,
          strokes: [...page.strokes, ...movedStrokes],
          shapes: [...page.shapes, ...movedShapes],
          graphs: [...page.graphs, ...movedGraphs],
          images: [...(page.images ?? []), ...movedImages],
        };
      }
      return page;
    }));
  };

  const handleFitPage = () => {
    const canvas = document.querySelector<SVGSVGElement>('.board-svg');
    if (!canvas) return;
    const zoom = Math.min(canvas.clientWidth / activePage.width, canvas.clientHeight / activePage.height);
    setViewport({
      zoom,
      x: (canvas.clientWidth - activePage.width * zoom) / 2,
      y: (canvas.clientHeight - activePage.height * zoom) / 2,
    });
  };

  const handleFitWidth = () => {
    const canvas = document.querySelector<SVGSVGElement>('.board-svg');
    if (!canvas) return;
    const zoom = canvas.clientWidth / activePage.width;
    setViewport({ zoom, x: 0, y: 0 });
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className={`claboard-app ${isDocked ? 'docked' : ''} ${isSidebarLeft ? 'sidebar-left' : ''} ${theme}-theme`}>
      <TopBar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        isDocked={isDocked}
        onToggleDock={() => setIsDocked((docked) => !docked)}
        onOpenGraphDialog={() => setGraphDialogOpen(true)}
        onOpenGeometryTool={handleOpenGeometryTool}
        onOpenCalculator={() => setCalculatorOpen(true)}
        onImportImage={handleImportImage}
        onPresent={handleStartPresentation}
        isPdfPage={Boolean(pageGroups.find((group) => group.id === activePage.groupId && group.type === 'pdf'))}
        recordingState={recordingState}
        onStartRecording={startRecording}
        onSavePdf={handleSavePdf}
        activeSubmenu={activeSubmenu}
        setActiveSubmenu={setActiveSubmenu}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        pressureEnabled={pressureEnabled}
        setPressureEnabled={setPressureEnabled}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        magicInkEnabled={magicInkEnabled}
        setMagicInkEnabled={setMagicInkEnabled}
        eraserMode={eraserMode}
        setEraserMode={setEraserMode}
        eraserWidth={eraserWidth}
        setEraserWidth={setEraserWidth}
        onClearPage={handleClearPage}
        activeShape={activeShape}
        setActiveShape={setActiveShape}
        shapeFilled={shapeFilled}
        setShapeFilled={setShapeFilled}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onNewPage={handleNewPage}
        onDeletePage={handleDeletePage}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onToggleFullscreen={handleToggleFullscreen}
      />

      <main className={`workspace-main ${isSidebarLeft ? 'sidebar-left' : ''}`}>
        <BoardCanvas
          page={activePage}
          activeTool={activeTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          pressureEnabled={pressureEnabled}
          magicInkEnabled={magicInkEnabled}
          eraserMode={eraserMode}
          eraserWidth={eraserWidth}
          colorInverted={colorInverted}
          geometryTool={geometryTool}
          onGeometryToolChange={setGeometryTool}
          activeShape={activeShape}
          shapeFilled={shapeFilled}
          patternVisible={patternVisible}
          viewport={viewport}
          setViewport={setViewport}
          onAddStroke={handleAddStroke}
          onAddShape={handleAddShape}
          onFillShape={handleFillShape}
          onEraseStroke={handleEraseStroke}
          onEraseShape={handleEraseShape}
          onBulkErase={handleBulkErase}
          onClassicErase={handleClassicErase}
          onExtendPage={handleExtendPage}
          onUpdateScreenShade={handleUpdateScreenShade}
          onDropItems={handleDropItems}
          onLivePreview={handleLivePreview}
          onUpdateGraph={handleUpdateGraph}
          onUpdateImage={handleUpdateImage}
          onMoveItems={handleMoveItems}
          onGroupItems={handleGroupItems}
          onUngroupItems={handleUngroupItems}
          onDeleteItems={handleDeleteItems}
          onUpdatePageHeader={handleUpdatePageHeader}
          onInteractionModeChange={setInteractionMode}
        />

        <Sidebar
          pages={pages}
          livePreview={livePreview?.pageId === activePage.id ? livePreview : null}
          groups={pageGroups}
          activePageId={activePage.id}
          isDrawing={interactionMode === 'DRAW'}
          isLeft={isSidebarLeft}
          onToggleSidebarSide={() => setIsSidebarLeft((left) => !left)}
          patternVisible={patternVisible}
          colorInverted={colorInverted}
          onSelectPage={setActivePageId}
          onNewPage={handleNewPage}
          onDeletePages={handleDeletePages}
          onClearPage={(id) => {
            pushHistory(pages);
            setPages((current) => current.map((page) => page.id === id
              ? { ...page, strokes: [], shapes: [], graphs: [], images: [] }
              : page));
          }}
          onInsertPageAfter={handleInsertPageAfter}
          onClonePages={handleClonePages}
          onRenamePage={handleRenamePage}
          onUpdateBackground={handleUpdateBackground}
          onToggleScreenShade={handleToggleScreenShade}
          onReorderPages={handleReorderPages}
          onCreateGroup={handleCreateGroup}
          onUpdatePageGroup={handleUpdatePageGroup}
          onRenameGroup={handleRenameGroup}
          onToggleGroup={handleToggleGroup}
          onImportPdf={handleImportPdf}
        />
      </main>

      <StatusBar
        mode={interactionMode}
        activeTool={activeTool}
        pdfFileName={pdfFileName}
        onPdfFileNameChange={setPdfFileName}
        onSavePdf={handleSavePdf}
        pageNumber={activePage.number}
        pageCount={pages.length}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        colorInverted={colorInverted}
        onToggleColorInversion={() => setColorInverted((inverted) => !inverted)}
        recordingState={recordingState}
        microphoneEnabled={microphoneEnabled}
        onStopRecording={stopRecording}
        onToggleMicrophone={toggleMicrophone}
        onToggleRecordingPause={toggleRecordingPause}
        patternVisible={patternVisible}
        onTogglePattern={() => setPatternVisible((visible) => !visible)}
        pattern={activePage.background?.pattern ?? 'grid'}
        onChangePattern={(pattern: PaperPattern) => {
          const background = activePage.background ?? { color: '#ffffff', pattern };
          handleUpdateBackground(activePage.id, { ...background, pattern });
        }}
        zoom={viewport.zoom}
        onResetZoom={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        onFitPage={handleFitPage}
        onFitWidth={handleFitWidth}
      />
      {graphDialogOpen && (
        <GraphDialog onCancel={() => setGraphDialogOpen(false)} onCreate={handleAddGraph} />
      )}
      {calculatorOpen && <ScientificCalculator onClose={() => setCalculatorOpen(false)} />}
      {presentation && (() => {
        const slidePages = pages.filter((page) => page.groupId === presentation.groupId);
        return slidePages.length > 0
          ? <PresentationView pages={slidePages} initialPageId={presentation.initialPageId} onExit={() => setPresentation(null)} />
          : null;
      })()}
    </div>
  );
}

export default App;