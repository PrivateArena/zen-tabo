import { createEffect, onMount, onCleanup, createSignal, Show } from 'solid-js';
import type { Component, Accessor } from 'solid-js';
import { drawGrid } from '../renderer/canvas-fallback';
import type { GridDimension, GridDataSource, SelectedCell } from '../renderer/canvas-fallback';

interface ViewportProps {
  scrollX: Accessor<number>;
  setScrollX: (x: number) => void;
  scrollY: Accessor<number>;
  setScrollY: (y: number) => void;
  selectedCell: Accessor<SelectedCell | null>;
  setSelectedCell: (cell: SelectedCell | null) => void;
  selectedColumn: Accessor<number | null>;
  setSelectedColumn: (col: number | null) => void;
  dims: GridDimension;
  data: GridDataSource;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellCommit?: (row: number, col: number, value: string) => void;
}

export const Viewport: Component<ViewportProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let canvasRef!: HTMLCanvasElement;
  let scrollSentinelYRef!: HTMLDivElement;
  let scrollSentinelXRef!: HTMLDivElement;

  const [editingCell, setEditingCell] = createSignal<{ row: number; col: number; val: string } | null>(null);

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

  // Redraw helper
  const redraw = () => {
    if (!ctx || !canvasRef || !containerRef) return;
    const w = containerRef.clientWidth;
    const h = containerRef.clientHeight;

    drawGrid(
      ctx,
      w,
      h,
      props.scrollX(),
      props.scrollY(),
      props.selectedCell(),
      props.selectedColumn(),
      props.dims,
      props.data
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
    canvasRef.height = rect.height * dpr;
    canvasRef.style.width = `${rect.width}px`;
    canvasRef.style.height = `${rect.height}px`;
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    redraw();
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

  // Handle click events on Grid
  const handleCanvasClick = (e: MouseEvent) => {
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { headerWidth, headerHeight } = props.dims;

    if (y < headerHeight && x >= headerWidth) {
      // Clicked column header
      const clickedCol = Math.floor((x - headerWidth + props.scrollX()) / defaultColWidth);
      if (clickedCol >= 0 && clickedCol < props.dims.totalCols) {
        props.setSelectedColumn(clickedCol);
        props.setSelectedCell({ row: 0, col: clickedCol }); // Focus top cell
      }
    } else if (x < headerWidth && y >= headerHeight) {
      // Clicked row header
      const clickedRow = Math.floor((y - headerHeight + props.scrollY()) / rowHeight);
      if (clickedRow >= 0 && clickedRow < props.dims.totalRows) {
        props.setSelectedColumn(null);
        props.setSelectedCell({ row: clickedRow, col: 0 }); // Focus first cell of row
      }
    } else if (x >= headerWidth && y >= headerHeight) {
      // Clicked grid cell
      const col = Math.floor((x - headerWidth + props.scrollX()) / defaultColWidth);
      const row = Math.floor((y - headerHeight + props.scrollY()) / rowHeight);
      
      if (col >= 0 && col < props.dims.totalCols && row >= 0 && row < props.dims.totalRows) {
        props.setSelectedColumn(null);
        props.setSelectedCell({ row, col });
      }
    }
  };

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
    const maxScrollY = Math.max(0, totalGridHeight - rect.height);
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

    // Enter / F2 starts editing
    if (e.key === 'Enter' || e.key === 'F2') {
      const cellData = props.data.getCell(cell.row, cell.col);
      setEditingCell({ row: cell.row, col: cell.col, val: cellData ? String(cellData.value) : '' });
      e.preventDefault();
      return;
    }

    // Alphanumeric keys start editing and overwrite cell content
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
    
    // Auto-scroll selected cell into view
    const rect = containerRef.getBoundingClientRect();
    const { headerWidth, headerHeight } = props.dims;

    const cellX = headerWidth + (newCol * defaultColWidth);
    const cellY = headerHeight + (newRow * rowHeight);

    // Vertical boundary checks
    if (cellY < props.scrollY() + headerHeight) {
      props.setScrollY(cellY - headerHeight);
    } else if (cellY + rowHeight > props.scrollY() + rect.height) {
      props.setScrollY(cellY + rowHeight - rect.height);
    }

    // Horizontal boundary checks
    if (cellX < props.scrollX() + headerWidth) {
      props.setScrollX(cellX - headerWidth);
    } else if (cellX + defaultColWidth > props.scrollX() + rect.width) {
      props.setScrollX(cellX + defaultColWidth - rect.width);
    }
  };

  onMount(() => {
    ctx = canvasRef.getContext('2d');
    
    // Perform initial canvas sizing
    resizeCanvas();

    // Resize Observer for responsive resizing
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerRef);

    // Scroll event listener for mousewheel directly on canvas
    canvasRef.addEventListener('wheel', handleWheel, { passive: false });
    
    // Keyboard listener on window for navigation when canvas is in focus
    window.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      resizeObserver.disconnect();
      canvasRef.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    });
  });

  // Re-run draw when scroll offsets, selections, or dimensions update
  createEffect(() => {
    // Register signals as dependencies
    props.scrollX();
    props.scrollY();
    props.selectedCell();
    props.selectedColumn();
    
    requestRedraw();
  });

  return (
    <div 
      class="grid-viewport-container" 
      ref={containerRef}
      style="outline: none;"
      tabIndex="0"
    >
      <canvas 
        class="grid-canvas" 
        ref={canvasRef}
        onClick={handleCanvasClick}
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
      >
        <div style={{ height: `${totalGridHeight}px`, width: '1px' }}></div>
      </div>

      {/* Hidden Native Horizontal Scrollbar */}
      <div 
        class="scroll-sentinel-x" 
        ref={scrollSentinelXRef}
        onScroll={handleXScroll}
        style={{ left: `${props.dims.headerWidth}px`, width: `calc(100% - ${props.dims.headerWidth}px)` }}
      >
        <div style={{ width: `${totalGridWidth}px`, height: '1px' }}></div>
      </div>
    </div>
  );
};
