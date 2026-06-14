import { createSignal, onMount, Show } from 'solid-js';
import { Toolbar } from './components/Toolbar';
import { FormulaBar } from './components/FormulaBar';
import { Sidebar } from './components/Sidebar';
import type { ColumnStats, SQLResult } from './components/Sidebar';
import { Viewport } from './components/Viewport';
import { SheetStore } from './core/sheet-store';
import { DbEngine } from './core/db-engine';
import { SharedGridMemory } from './core/shared-memory';
import type { SelectedCell } from './renderer/canvas-fallback';

function App() {
  // Data layers
  const store = new SheetStore();
  const db = new DbEngine();
  const sharedMem = new SharedGridMemory();

  // Scroll and selection signals
  const [scrollX, _setScrollX] = createSignal(0);
  const [scrollY, _setScrollY] = createSignal(0);
  const [selectedCell, _setSelectedCell] = createSignal<SelectedCell | null>({ row: 0, col: 0 });
  const [selectedColumn, _setSelectedColumn] = createSignal<number | null>(null);

  // Custom setter wraps to write into SharedArrayBuffer atomically for zero-copy sync
  const setScrollX = (x: number) => {
    sharedMem.scrollX = Math.round(x);
    _setScrollX(sharedMem.scrollX);
  };

  const setScrollY = (y: number) => {
    sharedMem.scrollY = Math.round(y);
    _setScrollY(sharedMem.scrollY);
  };

  const setSelectedCell = (cell: SelectedCell | null) => {
    if (cell) {
      sharedMem.selectedRow = cell.row;
      sharedMem.selectedCol = cell.col;
      _setSelectedCell({ row: cell.row, col: cell.col });
      
      // Load value or formula into formula bar
      const cellData = store.getCell(cell.row, cell.col);
      const override = store.overrides.get(`${cell.col},${cell.row}`);
      if (override && override.formula) {
        setFormulaText(override.formula);
      } else {
        setFormulaText(String(cellData.value));
      }
    } else {
      _setSelectedCell(null);
    }
  };

  const setSelectedColumn = (col: number | null) => {
    _setSelectedColumn(col);
    if (col !== null) {
      sharedMem.selectedCol = col;
      updateStats(col);
    }
  };

  // UI state signals
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [activeTab, setActiveTab] = createSignal<'stats' | 'sql'>('stats');
  const [formulaText, setFormulaText] = createSignal('');
  const [triggerRedraw, setTriggerRedraw] = createSignal(0);

  // Statistics & SQL signals
  const [stats, setStats] = createSignal<ColumnStats | null>(null);
  const [sqlQuery, setSqlQuery] = createSignal('SELECT Product, ROUND(SUM(Revenue), 2) AS Total_Rev, COUNT(*) AS Sales_Count FROM active_sheet GROUP BY Product ORDER BY Total_Rev DESC;');
  const [sqlResult, setSqlResult] = createSignal<SQLResult | null>(null);
  const [isDbLoading, setIsDbLoading] = createSignal(true);

  // Update statistics for a column
  const updateStats = (colIdx: number) => {
    const s = store.computeColumnStats(colIdx);
    setStats(s);
  };

  // Formula bar submit
  const handleFormulaSubmit = () => {
    const cell = selectedCell();
    if (!cell) return;

    store.setCell(cell.row, cell.col, formulaText());
    
    // Trigger redraw and stats updates
    setTriggerRedraw(prev => prev + 1);
    
    if (selectedColumn() !== null) {
      updateStats(selectedColumn()!);
    } else {
      updateStats(cell.col);
    }

    // Sync to DuckDB background
    syncToDuckDB();
  };

  // Sync current sheet data to DuckDB-Wasm
  const syncToDuckDB = async () => {
    setIsDbLoading(true);
    try {
      const tableData = store.getTableData();
      await db.registerTable('active_sheet', tableData);
    } catch (err) {
      console.error('Failed to sync to DuckDB', err);
    } finally {
      setIsDbLoading(false);
    }
  };

  // Run SQL Query
  const handleRunSQL = async () => {
    if (isDbLoading()) return;
    setSqlResult({ columns: [], rows: [], errorMessage: 'Query executing...' });
    try {
      const res = await db.query(sqlQuery());
      setSqlResult(res);
    } catch (err) {
      setSqlResult({
        columns: [],
        rows: [],
        errorMessage: err instanceof Error ? err.message : String(err)
      });
    }
  };

  // Double click cell handler
  const handleCellDoubleClick = () => {
    // Focus the formula input element
    const inputEl = document.querySelector('.formula-input') as HTMLInputElement;
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  };

  // Load benchmark dataset
  const handleLoadMock = () => {
    store.loadMockData(100000); // 100k rows
    setTriggerRedraw(prev => prev + 1);
    
    // Select column D (Units) and show stats
    setSelectedColumn(3);
    setSelectedCell({ row: 0, col: 3 });

    // Sync to DuckDB
    syncToDuckDB();
  };

  // Initial load
  onMount(async () => {
    // Write sheet settings to shared memory
    sharedMem.totalRows = store.totalRows;
    sharedMem.totalCols = store.totalCols;

    // Load initial mock data
    store.loadMockData(100000);
    setTriggerRedraw(prev => prev + 1);
    
    // Select Col 5 (Revenue) and show stats on start
    setSelectedColumn(5);
    setSelectedCell({ row: 0, col: 5 });

    // Wait for DuckDB WASM to init
    await db.waitReady();
    
    // Initial sync
    await syncToDuckDB();
  });

  // Agent Interaction API via Vite HMR Websocket
  if ((import.meta as any).hot) {
    (import.meta as any).hot.on('agent-request', async (data: any) => {
      const { requestId, url, query, body } = data;
      
      const sendResponse = (success: boolean, payload: any, error?: string) => {
        (import.meta as any).hot.send('agent-response', { requestId, success, payload, error });
      };

      try {
        if (url === '/api/schema') {
          const schemaPayload = {
            totalRows: store.totalRows,
            totalCols: store.totalCols,
            columns: store.schemas.map((s, i) => ({
              index: i,
              letter: store.columnLetter(i),
              name: s.name,
              type: s.type,
              formula: s.formula
            }))
          };

          let markdown = `### Zen-Tabo Sheet Schema\n`;
          markdown += `* **Dimensions**: ${store.totalRows.toLocaleString()} rows x ${store.totalCols} columns\n\n`;
          markdown += `| Col Index | Letter | Name | Type | Formula |\n`;
          markdown += `| --- | --- | --- | --- | --- |\n`;
          schemaPayload.columns.forEach(c => {
            markdown += `| ${c.index} | **${c.letter}** | ${c.name} | \`${c.type}\` | ${c.formula ? `\`${c.formula}\`` : '_None_'} |\n`;
          });

          sendResponse(true, { json: schemaPayload, markdown });
        } 
        
        else if (url === '/api/query') {
          const sql = body.sql || query.sql;
          if (!sql) {
            sendResponse(false, null, 'SQL query parameter is required');
            return;
          }
          const result = await db.query(sql);

          let markdown = '';
          if (result.errorMessage) {
            markdown = `**SQL Error**: ${result.errorMessage}`;
          } else {
            markdown = `### Query Results (${result.rows.length} rows)\n\n`;
            if (result.columns.length > 0) {
              markdown += `| ` + result.columns.join(' | ') + ` |\n`;
              markdown += `| ` + result.columns.map(() => '---').join(' | ') + ` |\n`;
              result.rows.slice(0, 100).forEach(row => {
                markdown += `| ` + row.map(v => v === null || v === undefined ? '' : String(v)).join(' | ') + ` |\n`;
              });
              if (result.rows.length > 100) {
                markdown += `\n*... showing first 100 rows of ${result.rows.length} total rows*`;
              }
            } else {
              markdown += `*Empty result set*`;
            }
          }

          sendResponse(true, { json: result, markdown });
        } 
        
        else if (url === '/api/stats') {
          const statsPayload: Record<string, any> = {};
          store.schemas.forEach((schema, colIdx) => {
            if (schema.type === 'number') {
              const colStats = store.computeColumnStats(colIdx);
              if (colStats) {
                statsPayload[schema.name] = {
                  count: colStats.count,
                  mean: colStats.mean,
                  median: colStats.median,
                  min: colStats.min,
                  max: colStats.max,
                  stdDev: colStats.stdDev
                };
              }
            }
          });

          let markdown = `### Column Statistics Summary\n\n`;
          markdown += `| Column | Count | Mean | Median | Min | Max | Std Dev |\n`;
          markdown += `| --- | --- | --- | --- | --- | --- | --- |\n`;
          Object.entries(statsPayload).forEach(([colName, s]) => {
            markdown += `| **${colName}** | ${s.count} | ${s.mean.toFixed(2)} | ${s.median.toFixed(2)} | ${s.min.toFixed(2)} | ${s.max.toFixed(2)} | ${s.stdDev.toFixed(2)} |\n`;
          });

          sendResponse(true, { json: statsPayload, markdown });
        } 
        
        else if (url === '/api/edit') {
          const { col, row, val, formula } = body;
          if (col === undefined) {
            sendResponse(false, null, 'Column index (col) is required');
            return;
          }

          if (row !== undefined) {
            store.setCell(row, col, formula || val || '');
          } else {
            store.setColumnFormula(col, formula || '');
          }

          triggerRedraw();
          if (selectedColumn() !== null) {
            updateStats(selectedColumn()!);
          } else {
            updateStats(col);
          }
          await syncToDuckDB();

          const resultMsg = row !== undefined 
            ? `Cell at row ${row}, col ${col} successfully updated to: ${formula || val}`
            : `Column ${col} formula successfully updated to: ${formula}`;

          sendResponse(true, { 
            json: { success: true, message: resultMsg },
            markdown: `**Success**: ${resultMsg}`
          });
        } 
        
        else {
          sendResponse(false, null, `Unknown endpoint: ${url}`);
        }
      } catch (err) {
        sendResponse(false, null, err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div class="app-container">
      {/* 1. Header Toolbar */}
      <Toolbar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        rowCount={() => store.totalRows}
        colCount={() => store.totalCols}
        onImportMock={handleLoadMock}
      />

      {/* 2. Formula Bar */}
      <FormulaBar 
        selectedCell={selectedCell}
        formulaText={formulaText}
        setFormulaText={setFormulaText}
        onFormulaSubmit={handleFormulaSubmit}
        columnLetter={store.columnLetter}
      />

      {/* 3. Main Workspace */}
      <main class={`main-workspace ${!sidebarOpen() ? 'sidebar-collapsed' : ''}`}>
        {/* Viewport canvas */}
        <Viewport 
          scrollX={scrollX}
          setScrollX={setScrollX}
          scrollY={scrollY}
          setScrollY={setScrollY}
          selectedCell={selectedCell}
          setSelectedCell={setSelectedCell}
          selectedColumn={selectedColumn}
          setSelectedColumn={setSelectedColumn}
          dims={{
            colWidths: new Array(store.totalCols).fill(110),
            rowHeights: new Array(store.totalRows).fill(26),
            totalCols: store.totalCols,
            totalRows: store.totalRows,
            headerWidth: 55,
            headerHeight: 28
          }}
          data={{
            getCell: (r, c) => {
              // Trigger dependency on redraw signal
              triggerRedraw();
              return store.getCell(r, c);
            },
            columnLetter: store.columnLetter
          }}
          onCellDoubleClick={handleCellDoubleClick}
          onCellCommit={(r, c, val) => {
            store.setCell(r, c, val);
            triggerRedraw();
            updateStats(c);
            syncToDuckDB();
          }}
        />

        {/* Sidebar analytics and SQL panels */}
        <Show when={sidebarOpen()}>
          <Sidebar 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            stats={stats}
            sqlQuery={sqlQuery}
            setSqlQuery={setSqlQuery}
            onRunSQL={handleRunSQL}
            sqlResult={sqlResult}
          />
        </Show>
      </main>

      {/* 4. Footer Status Bar */}
      <footer class="status-bar">
        <div class="status-bar-left">
          <div class="status-bar-item">
            <span>Coordinate:</span>
            <strong style="color: var(--text-accent);">
              {selectedCell() ? `${store.columnLetter(selectedCell()!.col)}${selectedCell()!.row + 1}` : '---'}
            </strong>
          </div>
          <div class="status-bar-item">
            <span>Row Count:</span>
            <strong>{store.totalRows.toLocaleString()}</strong>
          </div>
          <div class="status-bar-item">
            <span>Col Count:</span>
            <strong>{store.totalCols}</strong>
          </div>
        </div>
        <div class="status-bar-right">
          <div class="status-bar-item">
            <span>Mode:</span>
            <strong style="color: var(--text-accent);">Vector calculations cascade</strong>
          </div>
          <div class="status-bar-item">
            <span>DuckDB:</span>
            <Show when={isDbLoading()} fallback={<strong style="color: var(--text-accent);">IDLE</strong>}>
              <strong style="color: hsl(210, 80%, 65%);">SYNCING...</strong>
            </Show>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
