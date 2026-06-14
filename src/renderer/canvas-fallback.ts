// High-fidelity Canvas 2D fallback renderer for Zen-Tabo Virtualized Grid
// Handles sub-millisecond drawing of grid lines, cells, text, selection boxes, and headers.

export interface SelectedCell {
  row: number;
  col: number;
}

export interface GridDimension {
  colWidths: number[];
  rowHeights: number[];
  totalCols: number;
  totalRows: number;
  headerWidth: number;
  headerHeight: number;
}

export interface CellData {
  value: string | number;
  isFormula?: boolean;
  isOverride?: boolean;
}

export interface GridDataSource {
  getCell: (row: number, col: number) => CellData | null;
  columnLetter: (colIdx: number) => string;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollX: number,
  scrollY: number,
  selectedCell: SelectedCell | null,
  selectedColumn: number | null,
  dims: GridDimension,
  data: GridDataSource
) {
  // Clear with background color
  ctx.fillStyle = '#0f1117'; // bg-primary (hsl 220 15% 8%)
  ctx.fillRect(0, 0, width, height);

  // Set font
  ctx.font = '13px Outfit, sans-serif';
  ctx.textBaseline = 'middle';

  // Calculate visible range
  const { colWidths, totalCols, totalRows, headerWidth, headerHeight } = dims;
  const rowHeight = dims.rowHeights[0] || 26; // Fixed height for speed in 1M rows

  // Find start and end column
  let startCol = 0;
  let startColOffset = 0;
  
  // Quick lookup since colWidths might be uniform
  const defaultColWidth = colWidths[0] || 110;
  
  // Calculate column offsets with scrollX
  startCol = Math.floor(scrollX / defaultColWidth);
  startCol = Math.max(0, Math.min(startCol, totalCols - 1));
  startColOffset = (startCol * defaultColWidth) - scrollX + headerWidth;

  // Find start and end row
  let startRow = Math.floor(scrollY / rowHeight);
  startRow = Math.max(0, Math.min(startRow, totalRows - 1));
  let startRowOffset = (startRow * rowHeight) - scrollY + headerHeight;

  // Draw grid cells and grid lines
  let drawX = startColOffset;
  let colIdx = startCol;
  
  // Loop columns
  while (drawX < width && colIdx < totalCols) {
    const colW = colWidths[colIdx] || defaultColWidth;
    
    let drawY = startRowOffset;
    let rowIdx = startRow;

    // Loop rows
    while (drawY < height && rowIdx < totalRows) {
      const cell = data.getCell(rowIdx, colIdx);
      
      // Check if this column is highlighted
      const isColSelected = selectedColumn === colIdx;
      const isCellSelected = selectedCell && selectedCell.row === rowIdx && selectedCell.col === colIdx;

      // Draw cell background
      if (isCellSelected) {
        ctx.fillStyle = '#1e2430'; // Highlight selected cell slightly
      } else if (isColSelected) {
        ctx.fillStyle = 'rgba(150, 60, 55, 0.06)'; // HSL accent tint
      } else if (rowIdx % 2 === 1) {
        ctx.fillStyle = '#12151d'; // Zebra striping
      } else {
        ctx.fillStyle = '#0f1117'; // Normal bg
      }
      ctx.fillRect(drawX, drawY, colW, rowHeight);

      // Draw cell value
      if (cell && cell.value !== undefined && cell.value !== '') {
        const valStr = String(cell.value);
        ctx.save();
        // Clip text to cell boundary
        ctx.beginPath();
        ctx.rect(drawX + 6, drawY, colW - 12, rowHeight);
        ctx.clip();

        if (cell.isFormula) {
          ctx.fillStyle = 'hsl(210, 80%, 65%)'; // formula text is blueish
          ctx.font = '12px "JetBrains Mono", monospace';
        } else if (cell.isOverride) {
          ctx.fillStyle = 'hsl(270, 70%, 70%)'; // override is purple
        } else if (typeof cell.value === 'number') {
          ctx.fillStyle = 'hsl(150, 60%, 55%)'; // numbers are emerald
          ctx.textAlign = 'right';
        } else {
          ctx.fillStyle = 'hsl(0, 0%, 95%)'; // normal text
          ctx.textAlign = 'left';
        }

        const textX = ctx.textAlign === 'right' ? drawX + colW - 8 : drawX + 8;
        const textY = drawY + rowHeight / 2;
        ctx.fillText(valStr, textX, textY);
        ctx.restore();
      }

      // Draw grid line (bottom and right of cells)
      ctx.strokeStyle = '#232733'; // border-color (hsl 220 10% 20%)
      ctx.lineWidth = 1;
      ctx.beginPath();
      // vertical line
      ctx.moveTo(drawX + colW, drawY);
      ctx.lineTo(drawX + colW, drawY + rowHeight);
      // horizontal line
      ctx.moveTo(drawX, drawY + rowHeight);
      ctx.lineTo(drawX + colW, drawY + rowHeight);
      ctx.stroke();

      drawY += rowHeight;
      rowIdx++;
    }

    drawX += colW;
    colIdx++;
  }

  // Draw Row Headers (left column containing row numbers)
  let drawRowY = startRowOffset;
  let rowIdxHeader = startRow;
  ctx.fillStyle = '#161922'; // bg-secondary
  ctx.fillRect(0, 0, headerWidth, height);
  ctx.fillStyle = 'hsl(220, 10%, 70%)'; // text-secondary
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#232733';
  ctx.lineWidth = 1;

  while (drawRowY < height && rowIdxHeader < totalRows) {
    // Draw row text
    ctx.fillText(String(rowIdxHeader + 1), headerWidth / 2, drawRowY + rowHeight / 2);
    
    // Draw separator line
    ctx.beginPath();
    ctx.moveTo(0, drawRowY + rowHeight);
    ctx.lineTo(headerWidth, drawRowY + rowHeight);
    ctx.stroke();

    drawRowY += rowHeight;
    rowIdxHeader++;
  }

  // Draw Column Headers (top row containing A, B, C...)
  let drawColX = startColOffset;
  let colIdxHeader = startCol;
  ctx.fillStyle = '#161922'; // bg-secondary
  ctx.fillRect(0, 0, width, headerHeight);
  ctx.fillStyle = 'hsl(220, 10%, 70%)'; // text-secondary
  ctx.font = '12px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#232733';
  ctx.lineWidth = 1;

  while (drawColX < width && colIdxHeader < totalCols) {
    const colW = colWidths[colIdxHeader] || defaultColWidth;
    
    // Highlight if selected column
    if (selectedColumn === colIdxHeader) {
      ctx.fillStyle = 'rgba(150, 60, 55, 0.15)';
      ctx.fillRect(drawColX, 0, colW, headerHeight);
      ctx.fillStyle = 'hsl(150, 60%, 55%)';
    } else {
      ctx.fillStyle = 'hsl(220, 10%, 70%)';
    }

    ctx.fillText(data.columnLetter(colIdxHeader), drawColX + colW / 2, headerHeight / 2);
    
    // Draw separator line
    ctx.beginPath();
    ctx.moveTo(drawColX + colW, 0);
    ctx.lineTo(drawColX + colW, headerHeight);
    ctx.stroke();

    drawColX += colW;
    colIdxHeader++;
  }

  // Top-left header intersection block
  ctx.fillStyle = '#1c1f2b'; // bg-surface
  ctx.fillRect(0, 0, headerWidth, headerHeight);
  ctx.beginPath();
  ctx.moveTo(headerWidth, 0);
  ctx.lineTo(headerWidth, headerHeight);
  ctx.lineTo(0, headerHeight);
  ctx.stroke();

  // Draw cell selection border
  if (selectedCell) {
    const { row, col } = selectedCell;
    
    // Calculate screen coordinate for selected cell
    let cellX = headerWidth;
    for (let c = 0; c < col; c++) {
      cellX += colWidths[c] || defaultColWidth;
    }
    cellX -= scrollX;

    const cellY = headerHeight + (row * rowHeight) - scrollY;

    const colW = colWidths[col] || defaultColWidth;

    // Check if selected cell is in viewport
    if (cellX + colW > headerWidth && cellX < width && cellY + rowHeight > headerHeight && cellY < height) {
      ctx.strokeStyle = 'hsl(150, 60%, 55%)'; // Emerald glow
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(150, 60, 55, 0.4)';
      ctx.shadowBlur = 4;
      ctx.strokeRect(cellX, cellY, colW, rowHeight);
      ctx.shadowBlur = 0; // Reset shadow
    }
  }
}
