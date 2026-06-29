import { createEffect, onMount, onCleanup, createSignal, Show, For } from 'solid-js';
import type { Component, Accessor } from 'solid-js';
import { drawGrid } from '../renderer/canvas-fallback';
import type { GridDimension, GridDataSource, SelectedCell, CellRange } from '../renderer/canvas-fallback';
import type { ColumnSchema } from '../core/sheet-store';

interface ViewportProps {
  scrollX: Accessor<number>;
  setScrollX: (x: number) => void;
  scrollY: Accessor<number>;
  setScrollY: (y: number) => void;
  selectedCell: Accessor<SelectedCell | null>;
  setSelectedCell: (cell: SelectedCell | null) => void;
  selectedColumn: Accessor<number | null>;
  setSelectedColumn: (col: number | null) => void;
  selectionRange: Accessor<CellRange | null>;
  setSelectionRange: (range: CellRange | null) => void;
  dims: GridDimension;
  data: GridDataSource;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellCommit?: (row: number, col: number, value: string) => void;
  schemas: ColumnSchema[];
  getAggregate: (colIdx: number, op: string | undefined) => any;
  onSetColumnAggregate: (colIdx: number, op: any) => void;
  showWizard: Accessor<boolean>;
  setShowWizard: (val: boolean) => void;
}

export const Viewport: Component<ViewportProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let canvasRef!: HTMLCanvasElement;
  let scrollSentinelYRef!: HTMLDivElement;
  let scrollSentinelXRef!: HTMLDivElement;

  const [editingCell, setEditingCell] = createSignal<{ row: number; col: number; val: string } | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; row: number; col: number } | null>(null);

  const commitEditing = () => {
    const edit = editingCell();
    if (edit) {
      props.onCellCommit?.(edit.row, edit.col, edit.val);
      setEditingCell(null);
      containerRef.focus();
    }
  };

  const defaultColWidth = props.dims.colWidths[0] || 110;
  const rowHeight = props.dims.rowHeights[0] || 26;
  const totalGridWidth = props.dims.totalCols * defaultColWidth + props.dims.headerWidth;
  const totalGridHeight = props.dims.totalRows * rowHeight + props.dims.headerHeight;

  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;

  const formatValue = (v: any) => {
    if (v === undefined || v === null || v === '') return '';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  // Redraw helper
  const redraw = () => {
    if (!ctx || !canvasRef || !containerRef) return;
    const w = containerRef.clientWidth;
    const h = containerRef.clientHeight - 28; // Adjust for aggregate footer

    drawGrid(
      ctx,
      w,
      h,
      props.scrollX(),
      props.scrollY(),
      props.selectedCell(),
      props.selectedColumn(),
      props.dims,
      props.data,
      props.selectionRange()
    );
  };

  const requestRedraw = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      redraw();
    });
  };

  const resizeCanvas = () => {
    if (!ctx || !canvasRef || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    
    canvasRef.width = rect.width * dpr;
    canvasRef.height = (rect.height - 28) * dpr;
    canvasRef.style.width = `${rect.width}px`;
    canvasRef.style.height = `${rect.height - 28}px`;
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    redraw();
  };

  const getCellFromEvent = (e: MouseEvent): { row: number; col: number } | null => {
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { headerWidth, headerHeight } = props.dims;

    if (x >= headerWidth && y >= headerHeight) {
      const col = Math.floor((x - headerWidth + props.scrollX()) / defaultColWidth);
      const row = Math.floor((y - headerHeight + props.scrollY()) / rowHeight);
      
      if (col >= 0 && col < props.dims.totalCols && row >= 0 && row < props.dims.totalRows) {
        return { row, col };
      }
    }
    return null;
  };

  // Drag selection mouse event handlers
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setContextMenu(null);

    const cell = getCellFromEvent(e);
    if (cell) {
      setIsDragging(true);
      props.setSelectedColumn(null);
      props.setSelectedCell(cell);
      props.setSelectionRange({
        startRow: cell.row,
        startCol: cell.col,
        endRow: cell.row,
        endCol: cell.col
      });
    } else {
      const rect = canvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { headerWidth, headerHeight } = props.dims;

      if (y < headerHeight && x >= headerWidth) {
        const col = Math.floor((x - headerWidth + props.scrollX()) / defaultColWidth);
        if (col >= 0 && col < props.dims.totalCols) {
          props.setSelectedColumn(col);
          props.setSelectedCell({ row: 0, col });
          props.setSelectionRange({ startRow: 0, startCol: col, endRow: props.dims.totalRows - 1, endCol: col });
        }
      } else if (x < headerWidth && y >= headerHeight) {
        const row = Math.floor((y - headerHeight + props.scrollY()) / rowHeight);
        if (row >= 0 && row < props.dims.totalRows) {
          props.setSelectedColumn(null);
          props.setSelectedCell({ row, col: 0 });
          props.setSelectionRange({ startRow: row, startCol: 0, endRow: row, endCol: props.dims.totalCols - 1 });
        }
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return;
    const cell = getCellFromEvent(e);
    if (cell) {
      const current = props.selectionRange();
      if (current) {
        props.setSelectionRange({
          ...current,
          endRow: cell.row,
          endCol: cell.col
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (cell) {
      const range = props.selectionRange();
      const inRange = range &&
        cell.row >= Math.min(range.startRow, range.endRow) &&
        cell.row <= Math.max(range.startRow, range.endRow) &&
        cell.col >= Math.min(range.startCol, range.endCol) &&
        cell.col <= Math.max(range.startCol, range.endCol);

      if (!inRange) {
        props.setSelectedCell(cell);
        props.setSelectionRange({
          startRow: cell.row,
          startCol: cell.col,
          endRow: cell.row,
          endCol: cell.col
        });
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        row: cell.row,
        col: cell.col
      });
    }
  };

  // Sync scroll from sentinel to signals
  const handleYScroll = () => {
    const top = scrollSentinelYRef.scrollTop;
    if (Math.abs(top - props.scrollY()) > 0.5) {
      props.setScrollY(top);
    }
  };

  const handleXScroll = () => {
    const left = scrollSentinelXRef.scrollLeft;
    if (Math.abs(left - props.scrollX()) > 0.5) {
      props.setScrollX(left);
    }
  };

  // Sync scroll from signals to sentinels
  createEffect(() => {
    const y = props.scrollY();
    if (scrollSentinelYRef && Math.abs(scrollSentinelYRef.scrollTop - y) > 0.5) {
      scrollSentinelYRef.scrollTop = Math.round(y);
    }
  });

  createEffect(() => {
    const x = props.scrollX();
    if (scrollSentinelXRef && Math.abs(scrollSentinelXRef.scrollLeft - x) > 0.5) {
      scrollSentinelXRef.scrollLeft = Math.round(x);
    }
  });

  // Handle double-click to edit cell inline
  const handleCanvasDoubleClick = (e: MouseEvent) => {
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { headerWidth, headerHeight } = props.dims;

    if (x >= headerWidth && y >= headerHeight) {
      const col = Math.floor((x - headerWidth + props.scrollX()) / defaultColWidth);
      const row = Math.floor((y - headerHeight + props.scrollY()) / rowHeight);
      
      if (col >= 0 && col < props.dims.totalCols && row >= 0 && row < props.dims.totalRows) {
        const cellData = props.data.getCell(row, col);
        setEditingCell({ row, col, val: cellData ? String(cellData.value) : '' });
      }
    }
  };

  // Canvas mousewheel listener
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scrollDeltaY = e.deltaY;
    const scrollDeltaX = e.deltaX;

    const rect = containerRef.getBoundingClientRect();
    const maxScrollY = Math.max(0, totalGridHeight - (rect.height - 28));
    const maxScrollX = Math.max(0, totalGridWidth - rect.width);

    const newScrollY = Math.max(0, Math.min(props.scrollY() + scrollDeltaY, maxScrollY));
    const newScrollX = Math.max(0, Math.min(props.scrollX() + scrollDeltaX, maxScrollX));

    props.setScrollY(newScrollY);
    props.setScrollX(newScrollX);
  };

  // Keyboard navigation & editing triggers
  const handleKeyDown = (e: KeyboardEvent) => {
    const cell = props.selectedCell();
    if (!cell) return;

    if (editingCell()) {
      if (e.key === 'Enter') {
        commitEditing();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setEditingCell(null);
        containerRef.focus();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === 'F2') {
      const cellData = props.data.getCell(cell.row, cell.col);
      setEditingCell({ row: cell.row, col: cell.col, val: cellData ? String(cellData.value) : '' });
      e.preventDefault();
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEditingCell({ row: cell.row, col: cell.col, val: e.key });
      e.preventDefault();
      return;
    }

    let newRow = cell.row;
    let newCol = cell.col;

    switch (e.key) {
      case 'ArrowUp':
        newRow = Math.max(0, cell.row - 1);
        e.preventDefault();
        break;
      case 'ArrowDown':
        newRow = Math.min(props.dims.totalRows - 1, cell.row + 1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        newCol = Math.max(0, cell.col - 1);
        e.preventDefault();
        break;
      case 'ArrowRight':
        newCol = Math.min(props.dims.totalCols - 1, cell.col + 1);
        e.preventDefault();
        break;
      case 'Tab':
        newCol = e.shiftKey ? Math.max(0, cell.col - 1) : Math.min(props.dims.totalCols - 1, cell.col + 1);
        e.preventDefault();
        break;
      default:
        return;
    }

    props.setSelectedCell({ row: newRow, col: newCol });
    props.setSelectionRange({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
    
    // Auto-scroll selected cell into view
    const rect = containerRef.getBoundingClientRect();
    const { headerWidth, headerHeight } = props.dims;

    const cellX = headerWidth + (newCol * defaultColWidth);
    const cellY = headerHeight + (newRow * rowHeight);

    if (cellY < props.scrollY() + headerHeight) {
      props.setScrollY(cellY - headerHeight);
    } else if (cellY + rowHeight > props.scrollY() + rect.height - 28) {
      props.setScrollY(cellY + rowHeight - (rect.height - 28));
    }

    if (cellX < props.scrollX() + headerWidth) {
      props.setScrollX(cellX - headerWidth);
    } else if (cellX + defaultColWidth > props.scrollX() + rect.width) {
      props.setScrollX(cellX + defaultColWidth - rect.width);
    }
  };

  onMount(() => {
    ctx = canvasRef.getContext('2d');
    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerRef);

    canvasRef.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.addEventListener('mousedown', handleMouseDown);
    canvasRef.addEventListener('mousemove', handleMouseMove);
    canvasRef.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);

    onCleanup(() => {
      resizeObserver.disconnect();
      canvasRef.removeEventListener('wheel', handleWheel);
      canvasRef.removeEventListener('mousedown', handleMouseDown);
      canvasRef.removeEventListener('mousemove', handleMouseMove);
      canvasRef.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', closeMenu);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    });
  });

  createEffect(() => {
    props.scrollX();
    props.scrollY();
    props.selectedCell();
    props.selectedColumn();
    props.selectionRange();
    requestRedraw();
  });

  return (
    <div 
      class="grid-viewport-container" 
      ref={containerRef}
      style="outline: none; position: relative;"
      tabIndex="0"
    >
      <canvas 
        class="grid-canvas" 
        ref={canvasRef}
        onDblClick={handleCanvasDoubleClick}
      />

      <Show when={editingCell()}>
        {(edit) => {
          const { headerWidth, headerHeight } = props.dims;
          const colW = props.dims.colWidths[edit().col] || defaultColWidth;
          
          const cellX = headerWidth + (edit().col * defaultColWidth) - props.scrollX();
          const cellY = headerHeight + (edit().row * rowHeight) - props.scrollY();

          return (
            <input
              type="text"
              class="grid-inline-editor"
              value={edit().val}
              onInput={(e) => setEditingCell({ ...edit(), val: e.currentTarget.value })}
              onBlur={commitEditing}
              style={{
                position: 'absolute',
                left: `${cellX}px`,
                top: `${cellY}px`,
                width: `${colW}px`,
                height: `${rowHeight}px`,
                font: '13px Outfit, sans-serif',
                padding: '0 6px',
                margin: '0',
                border: '2px solid hsl(150, 60%, 55%)',
                outline: 'none',
                background: '#161922',
                color: 'white',
                'box-sizing': 'border-box',
                'z-index': '100'
              }}
              ref={(el) => {
                setTimeout(() => {
                  el.focus();
                  el.select();
                }, 10);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  commitEditing();
                  const nextCol = e.shiftKey ? Math.max(0, edit().col - 1) : Math.min(props.dims.totalCols - 1, edit().col + 1);
                  props.setSelectedCell({ row: edit().row, col: nextCol });
                  e.preventDefault();
                }
              }}
            />
          );
        }}
      </Show>
      
      {/* Hidden Native Vertical Scrollbar */}
      <div 
        class="scroll-sentinel-y" 
        ref={scrollSentinelYRef}
        onScroll={handleYScroll}
        style={{ height: 'calc(100% - 28px)' }}
      >
        <div style={{ height: `${totalGridHeight}px`, width: '1px' }}></div>
      </div>

      {/* Hidden Native Horizontal Scrollbar */}
      <div 
        class="scroll-sentinel-x" 
        ref={scrollSentinelXRef}
        onScroll={handleXScroll}
        style={{ 
          left: `${props.dims.headerWidth}px`, 
          width: `calc(100% - ${props.dims.headerWidth}px)`,
          bottom: '28px'
        }}
      >
        <div style={{ width: `${totalGridWidth}px`, height: '1px' }}></div>
      </div>

      {/* Context Menu Component */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            style={{
              position: 'fixed',
              left: `${menu().x}px`,
              top: `${menu().y}px`,
              background: '#161922',
              border: '1px solid #232733',
              'box-shadow': '0 8px 24px rgba(0,0,0,0.5)',
              'border-radius': '6px',
              padding: '4px 0',
              'z-index': '200',
              'min-width': '155px'
            }}
          >
            <div 
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                font: '13px Outfit, sans-serif',
                color: 'white',
                display: 'flex',
                'align-items': 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(150, 60, 55, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                props.setSelectedColumn(menu().col);
                props.setSelectedCell({ row: menu().row, col: menu().col });
                props.setShowWizard(true);
                setContextMenu(null);
              }}
            >
              🧮 Math Wizard
            </div>
            
            <div 
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                font: '13px Outfit, sans-serif',
                color: 'white',
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'border-top': '1px solid #232733'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(150, 60, 55, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                const range = props.selectionRange();
                if (!range) return;
                const minR = Math.min(range.startRow, range.endRow);
                const maxR = Math.max(range.startRow, range.endRow);
                const minC = Math.min(range.startCol, range.endCol);
                const maxC = Math.max(range.startCol, range.endCol);
                
                let text = '';
                for (let r = minR; r <= maxR; r++) {
                  const rowCells = [];
                  for (let c = minC; c <= maxC; c++) {
                    const val = props.data.getCell(r, c)?.value ?? '';
                    rowCells.push(String(val));
                  }
                  text += rowCells.join('\t') + '\n';
                }
                navigator.clipboard.writeText(text.trim());
                setContextMenu(null);
              }}
            >
              📋 Copy Selection
            </div>

            <div 
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                font: '13px Outfit, sans-serif',
                color: 'white',
                display: 'flex',
                'align-items': 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(150, 60, 55, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                const range = props.selectionRange();
                if (!range) return;
                const minR = Math.min(range.startRow, range.endRow);
                const maxR = Math.max(range.startRow, range.endRow);
                const minC = Math.min(range.startCol, range.endCol);
                const maxC = Math.max(range.startCol, range.endCol);
                
                for (let r = minR; r <= maxR; r++) {
                  for (let c = minC; c <= maxC; c++) {
                    props.onCellCommit?.(r, c, '');
                  }
                }
                setContextMenu(null);
              }}
            >
              🧼 Clear Cells
            </div>

            <div 
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                font: '13px Outfit, sans-serif',
                color: 'white',
                display: 'flex',
                'align-items': 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(150, 60, 55, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                const range = props.selectionRange();
                if (!range) return;
                const minR = Math.min(range.startRow, range.endRow);
                const maxR = Math.max(range.startRow, range.endRow);
                const minC = Math.min(range.startCol, range.endCol);
                const maxC = Math.max(range.startCol, range.endCol);
                
                for (let r = minR; r <= maxR; r++) {
                  for (let c = minC; c <= maxC; c++) {
                    props.onCellCommit?.(r, c, '0');
                  }
                }
                setContextMenu(null);
              }}
            >
              🔢 Fill with Zeroes
            </div>
          </div>
        )}
      </Show>

      {/* Aggregate Footer Row */}
      <div 
        class="grid-aggregate-bar" 
        style={{
          position: 'absolute',
          bottom: '0',
          left: '0',
          width: '100%',
          height: '28px',
          background: '#161922',
          'border-top': '1px solid #232733',
          display: 'flex',
          'align-items': 'center',
          'z-index': '15',
          font: '12px Outfit, sans-serif',
          'box-sizing': 'border-box'
        }}
      >
        <div style={{
          width: `${props.dims.headerWidth}px`,
          height: '100%',
          background: '#1c1f2b',
          'border-right': '1px solid #232733',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'hsl(220, 10%, 70%)',
          'font-weight': '600',
          'box-sizing': 'border-box',
          'user-select': 'none'
        }}>
          📊
        </div>

        <div style={{
          flex: '1',
          overflow: 'hidden',
          position: 'relative',
          height: '100%'
        }}>
          <div style={{
            display: 'flex',
            position: 'absolute',
            left: `${-props.scrollX()}px`,
            top: '0',
            height: '100%'
          }}>
            <For each={props.schemas}>
              {(schema, colIdx) => {
                const colW = props.dims.colWidths[colIdx()] || defaultColWidth;
                return (
                  <div style={{
                    width: `${colW}px`,
                    height: '100%',
                    'border-right': '1px solid #232733',
                    'box-sizing': 'border-box',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'space-between',
                    padding: '0 8px',
                    color: 'white',
                    background: '#161922'
                  }}>
                    <Show
                      when={schema.type === 'number'}
                      fallback={<div style="flex: 1;"></div>}
                    >
                      <select
                        value={schema.aggregateOp || ''}
                        onChange={(e) => {
                          const val = e.currentTarget.value;
                          props.onSetColumnAggregate(colIdx(), val ? val : undefined);
                        }}
                        style="background: transparent; color: hsl(220, 10%, 70%); border: none; font-size: 11px; outline: none; cursor: pointer; max-width: 50px; font-family: Outfit, sans-serif; padding: 0; margin: 0;"
                      >
                        <option value="" style="background: #161922; color: #888;">None</option>
                        <option value="sum" style="background: #161922; color: white;">Sum</option>
                        <option value="avg" style="background: #161922; color: white;">Avg</option>
                        <option value="median" style="background: #161922; color: white;">Mid</option>
                        <option value="min" style="background: #161922; color: white;">Min</option>
                        <option value="max" style="background: #161922; color: white;">Max</option>
                        <option value="count" style="background: #161922; color: white;">Count</option>
                      </select>

                      <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: hsl(150, 60%, 55%); font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: calc(100% - 55px); text-align: right;">
                        {formatValue(props.getAggregate(colIdx(), schema.aggregateOp))}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
