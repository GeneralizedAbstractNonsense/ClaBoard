import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  FileUp,
  FolderPlus,
  GripVertical,
  Plus,
  PanelLeft,
  PanelRight,
  X,
} from 'lucide-react';
import { BoardPage, BoardShape, PageBackground as PageBackgroundData, PageGroup, PaperPattern, Stroke } from '../types/board';
import { getSvgPathFromPoints } from '../utils/strokeUtils';
import { ShapeRenderer } from './ShapeRenderer';
import { GraphRenderer } from './GraphRenderer';
import { PageBackground } from './PageBackground';
import { BoardImageRenderer } from './BoardImageRenderer';

interface SidebarProps {
  pages: BoardPage[];
  groups: PageGroup[];
  livePreview: { pageId: string; stroke: Stroke | null; shape: BoardShape | null } | null;
  activePageId: string;
  isDrawing: boolean;
  isLeft: boolean;
  onToggleSidebarSide: () => void;
  patternVisible: boolean;
  colorInverted: boolean;
  onSelectPage: (id: string) => void;
  onNewPage: () => void;
  onDeletePages: (ids: string[]) => void;
  onClearPage: (id: string) => void;
  onInsertPageAfter: (id: string) => void;
  onClonePages: (ids: string[]) => void;
  onRenamePage: (id: string, title: string) => void;
  onUpdateBackground: (id: string, background: PageBackgroundData) => void;
  onToggleScreenShade: (id: string, orientation?: 'horizontal' | 'vertical') => void;
  onReorderPages: (ids: string[], targetId: string, position: 'before' | 'after') => void;
  onCreateGroup: () => void;
  onUpdatePageGroup: (ids: string[], groupId?: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onToggleGroup: (id: string) => void;
  onImportPdf: (file: File) => void;
}

type PageMenu = { pageId: string; x: number; y: number };

const PATTERNS: { value: PaperPattern; label: string }[] = [
  { value: 'blank', label: 'Blank' },
  { value: 'lined', label: 'Ruled' },
  { value: 'grid', label: 'Grid' },
  { value: 'small-grid', label: 'Small grid' },
  { value: 'dots', label: 'Dots' },
  { value: 'graph', label: 'Graph' },
  { value: 'staff', label: 'Music staff' },
  { value: 'isometric', label: 'Isometric' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  groups,
  livePreview,
  activePageId,
  isDrawing,
  isLeft,
  onToggleSidebarSide,
  patternVisible,
  colorInverted,
  onSelectPage,
  onNewPage,
  onDeletePages,
  onClearPage,
  onInsertPageAfter,
  onClonePages,
  onRenamePage,
  onUpdateBackground,
  onToggleScreenShade,
  onReorderPages,
  onCreateGroup,
  onUpdatePageGroup,
  onRenameGroup,
  onToggleGroup,
  onImportPdf,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [autoHide, setAutoHide] = useState(false);
  const [peek, setPeek] = useState(false);
  const [width, setWidth] = useState(252);
  const [selectedIds, setSelectedIds] = useState<string[]>([activePageId]);
  const [anchorId, setAnchorId] = useState(activePageId);
  const [menu, setMenu] = useState<PageMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [backgroundPageId, setBackgroundPageId] = useState<string | null>(null);
  const [backgroundDraft, setBackgroundDraft] = useState<PageBackgroundData>({
    color: '#ffffff',
    pattern: 'blank',
  });
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropMark, setDropMark] = useState<{ pageId: string; position: 'before' | 'after' } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const preserveSelectionOnNavigation = useRef(false);
  const backgroundPage = pages.find((page) => page.id === backgroundPageId);
  const activeGroupId = pages.find((page) => page.id === activePageId)?.groupId;
  const previousActiveGroupId = useRef(activeGroupId);

  useEffect(() => {
    if (previousActiveGroupId.current === activeGroupId) return;
    previousActiveGroupId.current = activeGroupId;
    const activeGroup = groups.find((group) => group.id === activeGroupId);
    if (activeGroup?.collapsed) onToggleGroup(activeGroup.id);
  }, [activeGroupId, groups, onToggleGroup]);

  useEffect(() => {
    cardRefs.current.get(activePageId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (preserveSelectionOnNavigation.current) {
      preserveSelectionOnNavigation.current = false;
      return;
    }
    setSelectedIds([activePageId]);
    setAnchorId(activePageId);
  }, [activePageId]);

  useEffect(() => {
    cardRefs.current.get(activePageId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [groups]);

  useEffect(() => {
    setSelectedIds((ids) => {
      const current = ids.filter((id) => pages.some((page) => page.id === id));
      return current.length > 0 ? current : [activePageId];
    });
  }, [pages, activePageId]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!resizeRef.current) return;
      const direction = isLeft ? 1 : -1;
      setWidth(Math.max(190, Math.min(420, resizeRef.current.width + (event.clientX - resizeRef.current.x) * direction)));
    };
    const handleUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isLeft]);

  const choosePage = (event: React.MouseEvent | React.KeyboardEvent, pageId: string) => {
    preserveSelectionOnNavigation.current =
      (event.shiftKey || event.ctrlKey || event.metaKey) && pageId !== activePageId;
    const pageIndex = pages.findIndex((page) => page.id === pageId);
    if (event.shiftKey) {
      const anchorIndex = pages.findIndex((page) => page.id === anchorId);
      const start = Math.min(anchorIndex < 0 ? pageIndex : anchorIndex, pageIndex);
      const end = Math.max(anchorIndex < 0 ? pageIndex : anchorIndex, pageIndex);
      setSelectedIds(pages.slice(start, end + 1).map((page) => page.id));
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) =>
        current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId]
      );
      setAnchorId(pageId);
    } else {
      setSelectedIds([pageId]);
      setAnchorId(pageId);
    }
    onSelectPage(pageId);
  };

  const actionIds = (pageId: string) => selectedIds.includes(pageId) ? selectedIds : [pageId];

  const startRename = (page: BoardPage) => {
    setRenamingId(page.id);
    setRenameValue(page.title || `Page ${page.number}`);
    setMenu(null);
  };

  const finishRename = (pageId: string) => {
    const title = renameValue.trim();
    if (title) onRenamePage(pageId, title);
    setRenamingId(null);
  };

  const openBackground = (page: BoardPage) => {
    setBackgroundPageId(page.id);
    setBackgroundDraft(page.background ?? { color: '#ffffff', pattern: 'blank' });
    setMenu(null);
  };

  const chooseBackgroundImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Choose an image file for the page background.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setBackgroundDraft((current) => ({ ...current, imageData: result }));
      }
    };
    reader.onerror = () => window.alert('The background image could not be read.');
    reader.readAsDataURL(file);
  };

  const handleDragStart = (event: React.DragEvent, pageId: string) => {
    const ids = actionIds(pageId);
    setDragIds(ids);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-claboard-pages', ids.join(','));
  };

  const handleDropOnPage = (event: React.DragEvent, pageId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const ids = dragIds.length > 0 ? dragIds : [event.dataTransfer.getData('application/x-claboard-pages')].filter(Boolean);
    if (ids.length > 0) {
      onReorderPages(ids, pageId, position);
    }
    setDragIds([]);
    setDropMark(null);
  };

  const renderPage = (page: BoardPage) => (
    <div
      key={page.id}
      ref={(node) => {
        if (node) cardRefs.current.set(page.id, node);
        else cardRefs.current.delete(page.id);
      }}
      className={`page-card ${page.id === activePageId ? 'active' : ''} ${selectedIds.includes(page.id) ? 'selected' : ''} ${dropMark?.pageId === page.id ? `drop-${dropMark.position}` : ''}`}
      data-page-drop-target={page.id}
      role="button"
      tabIndex={0}
      draggable={renamingId !== page.id}
      onClick={(event) => choosePage(event, page.id)}
      onDoubleClick={() => startRename(page)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choosePage(event, page.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        choosePage(event, page.id);
        setMenu({ pageId: page.id, x: event.clientX, y: event.clientY });
      }}
      onDragStart={(event) => handleDragStart(event, page.id)}
      onDragOver={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setDropMark({ pageId: page.id, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' });
      }}
      onDrop={(event) => handleDropOnPage(event, page.id)}
      onDragEnd={() => {
        setDragIds([]);
        setDropMark(null);
      }}
    >
      <div className="page-thumb-wrap">
        <svg
          className={`page-thumb-canvas ${colorInverted ? 'color-inverted' : ''}`}
          viewBox={`0 0 ${page.width} ${page.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <PageBackground
            id={`thumb-${page.id}`}
            width={page.width}
            height={page.height}
            background={page.background}
            patternVisible={patternVisible}
          />
          {page.strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={getSvgPathFromPoints(stroke.points, stroke.size, stroke.pressureSensitive ?? true)}
              fill={stroke.color}
              opacity={stroke.tool === 'highlighter' ? 0.36 : 1}
            />
          ))}
          {page.images?.map((image) => <BoardImageRenderer key={image.id} image={image} />)}
          {livePreview?.pageId === page.id && livePreview.stroke && (
            <path
              d={getSvgPathFromPoints(livePreview.stroke.points, livePreview.stroke.size, livePreview.stroke.pressureSensitive ?? true)}
              fill={livePreview.stroke.color}
              opacity={livePreview.stroke.tool === 'highlighter' ? 0.36 : 0.75}
            />
          )}
          {livePreview?.pageId === page.id && livePreview.shape && (
            <ShapeRenderer shape={livePreview.shape} isPreview />
          )}
          {page.shapes.map((shape) => <ShapeRenderer key={shape.id} shape={shape} />)}
          {page.graphs.map((graph) => (
            <GraphRenderer
              key={graph.id}
              graph={graph}
              activeTool="select"
              canvasZoom={1}
              onChange={() => undefined}
            />
          ))}
          {page.screenShade && (
            <rect
              width={page.screenShade.orientation === 'vertical' ? page.width * page.screenShade.reveal : page.width}
              height={page.screenShade.orientation === 'vertical' ? page.height : page.height * page.screenShade.reveal}
              fill="rgba(12,16,24,0.94)"
            />
          )}
        </svg>
        <span className="page-num">{page.number}</span>
        <button
          className="page-menu-trigger"
          title="Page options"
          aria-label={`Options for page ${page.number}`}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ pageId: page.id, x: rect.right, y: rect.bottom });
          }}
        >
          <Ellipsis size={16} />
        </button>
      </div>
      <div className="page-card-meta">
        {renamingId === page.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => finishRename(page.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') finishRename(page.id);
              if (event.key === 'Escape') setRenamingId(null);
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Rename page ${page.number}`}
          />
        ) : (
          <span className="thumb-title" onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(page);
          }}>
            {page.title || page.createdAt || `Page ${page.number}`}
          </span>
        )}
      </div>
      {dropMark?.pageId === page.id && <span className={`page-drop-guide ${dropMark.position}`} />}
    </div>
  );

  const hidden = autoHide && isDrawing && !peek;
  if (collapsed || hidden) {
    return (
      <aside
        className={`sidebar-rail ${hidden ? 'auto-hidden' : ''} ${isLeft ? 'rail-left' : ''}`}
        onPointerEnter={() => hidden && setPeek(true)}
        onPointerLeave={() => setPeek(false)}
      >
        <button onClick={() => {
          if (hidden) setPeek(true);
          else setCollapsed(false);
        }}>
          {hidden ? <Eye size={16} /> : <ChevronRight size={16} />}
          <span>{hidden ? 'Pages' : `${pages.length} pages`}</span>
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside
        className={`pages-sidebar ${isLeft ? 'sidebar-left' : ''}`}
        style={{ width }}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest('input, select, textarea')) return;
          const modifier = event.ctrlKey || event.metaKey;
          if (modifier && event.key.toLowerCase() === 'd') {
            event.preventDefault();
            event.stopPropagation();
            onClonePages(selectedIds.length ? selectedIds : [activePageId]);
          } else if (event.key === 'Delete') {
            event.preventDefault();
            event.stopPropagation();
            onDeletePages(selectedIds.length ? selectedIds : [activePageId]);
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const currentIndex = pages.findIndex((page) => page.id === activePageId);
            const nextIndex = Math.max(0, Math.min(
              pages.length - 1,
              currentIndex + (event.key === 'ArrowDown' ? 1 : -1),
            ));
            if (pages[nextIndex]) {
              event.preventDefault();
              event.stopPropagation();
              choosePage(event, pages[nextIndex].id);
            }
          }
        }}
        onPointerLeave={() => {
          if (autoHide && isDrawing) setPeek(false);
        }}
      >
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden-file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onImportPdf(file);
            event.currentTarget.value = '';
          }}
        />
        <div className="sidebar-header">
          <strong>Page sequence</strong>
          <span>Page {pages.findIndex((page) => page.id === activePageId) + 1} of {pages.length}</span>
          <button className="sidebar-pdf-import" onClick={() => pdfInputRef.current?.click()} title="Import PDF slides" aria-label="Import PDF slides">
            <FileUp size={15} />
          </button>
        </div>
        <div className="sidebar-actions">
          <button className="sidebar-add-page" onClick={onNewPage}>
            <Plus size={16} /> Add page
          </button>
          <button className="sidebar-new-group" onClick={onCreateGroup} title="Create page group">
            <FolderPlus size={16} />
          </button>
        </div>
        <div className="pages-list" ref={listRef}>
          {groups.map((group) => {
            const groupPages = pages.filter((page) => page.groupId === group.id);
            return (
              <section
                key={group.id}
                className="page-group"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const ids = dragIds.length > 0 ? dragIds : [];
                  if (ids.length > 0) onUpdatePageGroup(ids, group.id);
                  setDragIds([]);
                }}
              >
                <div className="page-group-header">
                  <button onClick={() => onToggleGroup(group.id)} aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}>
                    {group.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <input
                    value={group.name}
                    onChange={(event) => onRenameGroup(group.id, event.target.value)}
                    aria-label="Page group name"
                  />
                </div>
                {!group.collapsed && groupPages.map(renderPage)}
              </section>
            );
          })}
          {pages.filter((page) => !page.groupId || !groups.some((group) => group.id === page.groupId)).map(renderPage)}
        </div>
        <div className="sidebar-footer-options">
          <label className="sidebar-auto-hide">
            <input type="checkbox" checked={autoHide} onChange={(event) => setAutoHide(event.target.checked)} />
            <span>Auto-hide</span>
          </label>
          <button
            className="sidebar-side-toggle"
            onClick={onToggleSidebarSide}
            title={isLeft ? 'Move sidebar right' : 'Move sidebar left'}
            aria-label={isLeft ? 'Move sidebar right' : 'Move sidebar left'}
          >
            {isLeft ? <PanelRight size={15} /> : <PanelLeft size={15} />}
          </button>
          <button
            className="sidebar-collapse-toggle"
            onClick={() => setCollapsed(true)}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <X size={15} />
          </button>
        </div>
        <div
          className={`sidebar-resize-handle ${isLeft ? 'resize-right' : 'resize-left'}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize page sequence"
          onPointerDown={(event) => {
            event.preventDefault();
            resizeRef.current = { x: event.clientX, width };
          }}
        >
          <GripVertical size={14} />
        </div>
      </aside>

      {menu && (
        <div
          className="page-context-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 310) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button onClick={() => {
            onDeletePages(actionIds(menu.pageId));
            setSelectedIds([]);
            setMenu(null);
          }}><X size={14} /> Delete page</button>
          <button onClick={() => {
            onClearPage(menu.pageId);
            setMenu(null);
          }}>Clear page</button>
          <button onClick={() => {
            onInsertPageAfter(menu.pageId);
            setMenu(null);
          }}><Plus size={14} /> Insert blank after</button>
          <button onClick={() => {
            onClonePages(actionIds(menu.pageId));
            setMenu(null);
          }}>Clone page</button>
          <button onClick={() => {
            const page = pages.find((item) => item.id === menu.pageId);
            if (page) startRename(page);
          }}>Rename page</button>
          <button onClick={() => {
            const page = pages.find((item) => item.id === menu.pageId);
            if (page) openBackground(page);
          }}>Set background…</button>
          <button onClick={() => {
            onToggleScreenShade(menu.pageId, 'horizontal');
            setMenu(null);
          }}>
            {pages.find((item) => item.id === menu.pageId)?.screenShade?.orientation !== 'vertical' ? <Eye size={14} /> : <EyeOff size={14} />}
            {pages.find((item) => item.id === menu.pageId)?.screenShade
              ? (pages.find((item) => item.id === menu.pageId)?.screenShade?.orientation ?? 'horizontal') === 'horizontal'
                ? 'Hide screen shade'
                : 'Shade from top / bottom'
              : 'Shade from top / bottom'}
          </button>
          <button onClick={() => {
            onToggleScreenShade(menu.pageId, 'vertical');
            setMenu(null);
          }}>
            {pages.find((item) => item.id === menu.pageId)?.screenShade?.orientation === 'vertical' ? <EyeOff size={14} /> : <Eye size={14} />}
            {pages.find((item) => item.id === menu.pageId)?.screenShade?.orientation === 'vertical' ? 'Hide screen shade' : 'Shade from left / right'}
          </button>
          {selectedIds.some((id) => pages.find((page) => page.id === id)?.groupId) && (
            <button onClick={() => {
              onUpdatePageGroup(actionIds(menu.pageId));
              setMenu(null);
            }}>Remove from group</button>
          )}
          <button onClick={() => setMenu(null)}>Cancel</button>
        </div>
      )}

      {backgroundPage && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBackgroundPageId(null);
        }}>
          <form
            className="background-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              onUpdateBackground(backgroundPage.id, backgroundDraft);
              setBackgroundPageId(null);
            }}
          >
            <h2>Page background</h2>
            <label>
              <span>Paper</span>
              <select
                value={backgroundDraft.pattern}
                onChange={(event) => setBackgroundDraft((current) => ({ ...current, pattern: event.target.value as PaperPattern }))}
              >
                {PATTERNS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Base color</span>
              <input
                type="color"
                value={backgroundDraft.color}
                onChange={(event) => setBackgroundDraft((current) => ({ ...current, color: event.target.value }))}
              />
            </label>
            <label>
              <span>Gradient color (optional)</span>
              <input
                type="color"
                value={backgroundDraft.gradientColor ?? backgroundDraft.color}
                onChange={(event) => setBackgroundDraft((current) => ({ ...current, gradientColor: event.target.value }))}
              />
            </label>
            <label>
              <span>Use gradient</span>
              <input
                type="checkbox"
                checked={Boolean(backgroundDraft.gradientColor)}
                onChange={(event) => setBackgroundDraft((current) => ({
                  ...current,
                  gradientColor: event.target.checked ? current.gradientColor ?? current.color : undefined,
                }))}
              />
            </label>
            <label>
              <span>Background image</span>
              <input type="file" accept="image/*" onChange={(event) => chooseBackgroundImage(event.target.files?.[0])} />
            </label>
            {backgroundDraft.imageData && (
              <button type="button" onClick={() => setBackgroundDraft((current) => ({ ...current, imageData: undefined }))}>
                Remove image
              </button>
            )}
            <div className="dialog-actions">
              <button type="button" className="dialog-cancel" onClick={() => setBackgroundPageId(null)}>Cancel</button>
              <button type="submit" className="dialog-submit">Apply background</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
