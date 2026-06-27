import type { ColumnStats } from '../components/Sidebar';

export type ColumnType = 'number' | 'string';

export interface ColumnSchema {
  index: number;
  name: string;
  type: ColumnType;
  formula?: string; // Column-level formula e.g. "D * E"
}

export interface CellOverride {
  value?: string | number;
  formula?: string; // Cell-specific formula override e.g. "=SUM(D1:D100)"
}

export class SheetStore {
  public totalRows = 100000; // 100,000 rows by default
  public totalCols = 10;     // 10 columns (A to J)
  
  // Base columns
  public columns: (Float64Array | string[])[] = [];
  public schemas: ColumnSchema[] = [];
  
  // Sparse overrides: key is "col,row"
  public overrides: Map<string, CellOverride> = new Map();
  
  // Calculation DAG: topological order of column indices
  private evaluationOrder: number[] = [];

  // Async Recalculation Worker
  private evalWorker: Worker | null = null;
  private evalResolve: (() => void) | null = null;
  private debounceTimeout: any = null;
  public onRecalculate: (() => void) | null = null;

  constructor() {
    this.initEmpty();
  }

  public createFloat64Array(size: number): Float64Array {
    if (typeof SharedArrayBuffer !== 'undefined') {
      const sab = new SharedArrayBuffer(size * 8);
      return new Float64Array(sab);
    }
    return new Float64Array(size);
  }

  private initEvalWorker() {
    if (!this.evalWorker) {
      this.evalWorker = new Worker(
        new URL('./eval.worker.ts', import.meta.url),
        { type: 'module' }
      );
      this.evalWorker.addEventListener('message', (e) => {
        const { type } = e.data;
        if (type === 'EVALUATE_DONE') {
          if (this.evalResolve) {
            this.evalResolve();
            this.evalResolve = null;
          }
          if (this.onRecalculate) {
            this.onRecalculate();
          }
        }
      });
    }

    // Send numeric columns SharedArrayBuffers to the worker
    const cols: Record<number, SharedArrayBuffer | ArrayBuffer> = {};
    for (let c = 0; c < this.totalCols; c++) {
      const schema = this.schemas[c];
      if (schema.type === 'number') {
        const arr = this.columns[c] as Float64Array;
        cols[c] = arr.buffer;
      }
    }
    this.evalWorker.postMessage({
      type: 'INIT_BUFFERS',
      payload: { cols }
    });
  }

  public initEmpty() {
    this.schemas = [
      { index: 0, name: 'ID', type: 'number' },
      { index: 1, name: 'Product', type: 'string' },
      { index: 2, name: 'Region', type: 'string' },
      { index: 3, name: 'Units', type: 'number' },
      { index: 4, name: 'Price', type: 'number' },
      { index: 5, name: 'Revenue', type: 'number', formula: 'Units * Price' },
      { index: 6, name: 'TaxRate', type: 'number' },
      { index: 7, name: 'TaxAmount', type: 'number', formula: 'Revenue * TaxRate' },
      { index: 8, name: 'NetRevenue', type: 'number', formula: 'Revenue - TaxAmount' },
      { index: 9, name: 'Date', type: 'string' }
    ];

    this.columns = [];
    for (let c = 0; c < this.totalCols; c++) {
      const schema = this.schemas[c];
      if (schema.type === 'number') {
        this.columns.push(this.createFloat64Array(this.totalRows));
      } else {
        this.columns.push(new Array<string>(this.totalRows).fill(''));
      }
    }
    
    this.overrides.clear();
    this.buildDAG();
    this.initEvalWorker();
  }

  // Load benchmark dataset with 100,000 rows (1,000,000 cells)
  public loadMockData(rowCount: number = 100000) {
    this.totalRows = rowCount;
    
    // Re-initialize arrays with new size
    this.columns = [];
    for (let c = 0; c < this.totalCols; c++) {
      const schema = this.schemas[c];
      if (schema.type === 'number') {
        this.columns.push(this.createFloat64Array(this.totalRows));
      } else {
        this.columns.push(new Array<string>(this.totalRows).fill(''));
      }
    }

    const ids = this.columns[0] as Float64Array;
    const products = this.columns[1] as string[];
    const regions = this.columns[2] as string[];
    const units = this.columns[3] as Float64Array;
    const prices = this.columns[4] as Float64Array;
    const taxRates = this.columns[6] as Float64Array;
    const dates = this.columns[9] as string[];

    const prodNames = ['Widget Alpha', 'Widget Beta', 'Gadget Nexus', 'Gadget Prime'];
    const regionNames = ['North East', 'South West', 'Midwest', 'Pacific Coast'];

    for (let r = 0; r < this.totalRows; r++) {
      ids[r] = r + 1;
      products[r] = prodNames[r % prodNames.length];
      regions[r] = regionNames[(r + 2) % regionNames.length];
      
      // Random units and price
      units[r] = 5 + (r % 150);
      prices[r] = 12.5 + (r % 85) * 2.5;
      taxRates[r] = 0.05 + ((r % 4) * 0.02); // 5%, 7%, 9%, 11%
      dates[r] = `2026-06-${String((r % 28) + 1).padStart(2, '0')}`;
    }

    this.overrides.clear();
    
    this.initEvalWorker();
    
    // Evaluate column formulas vectorially
    this.evaluateAllColumns();
  }

  // Build Topological order for vectorized formulas
  public buildDAG() {
    const adj: Map<number, number[]> = new Map();
    const inDegree: number[] = new Array(this.totalCols).fill(0);

    for (let i = 0; i < this.totalCols; i++) {
      adj.set(i, []);
    }

    // Parse column formulas to find dependencies
    this.schemas.forEach(schema => {
      if (schema.formula) {
        // Find which columns are referenced by name
        this.schemas.forEach(target => {
          if (target.index !== schema.index && schema.formula?.includes(target.name)) {
            // target.index -> schema.index
            adj.get(target.index)!.push(schema.index);
            inDegree[schema.index]++;
          }
        });
      }
    });

    // Kahn's algorithm
    const queue: number[] = [];
    for (let i = 0; i < this.totalCols; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    this.evaluationOrder = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      this.evaluationOrder.push(u);

      adj.get(u)!.forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      });
    }
  }

  // Evaluate cell value
  public getCell(row: number, col: number): { value: string | number; isFormula?: boolean; isOverride?: boolean } {
    const key = `${col},${row}`;
    const override = this.overrides.get(key);

    if (override) {
      if (override.formula) {
        const val = this.evaluateCellFormula(override.formula);
        return { value: val, isFormula: true, isOverride: true };
      }
      return { value: override.value ?? '', isOverride: true };
    }

    const schema = this.schemas[col];
    const val = this.columns[col][row];
    
    return {
      value: val !== undefined ? val : '',
      isFormula: !!schema.formula
    };
  }

  // Set cell override
  public setCell(row: number, col: number, text: string) {
    const key = `${col},${row}`;
    const schema = this.schemas[col];

    if (text === '') {
      this.overrides.delete(key);
    } else if (text.startsWith('=')) {
      this.overrides.set(key, { formula: text });
    } else {
      if (schema.type === 'number') {
        const num = parseFloat(text);
        if (!isNaN(num)) {
          // If we write to a base column, write directly to Float64Array for performance
          // if there is no formula. If there is a column formula, it acts as an override.
          if (!schema.formula) {
            (this.columns[col] as Float64Array)[row] = num;
            this.overrides.delete(key);
          } else {
            this.overrides.set(key, { value: num });
          }
        } else {
          this.overrides.set(key, { value: text });
        }
      } else {
        if (!schema.formula) {
          (this.columns[col] as string[])[row] = text;
          this.overrides.delete(key);
        } else {
          this.overrides.set(key, { value: text });
        }
      }
    }

    // Trigger recalculation cascade
    this.evaluateAllColumns();
  }

  // Set column formula dynamically and recalculate
  public setColumnFormula(colIdx: number, formula: string) {
    if (colIdx >= 0 && colIdx < this.totalCols) {
      this.schemas[colIdx].formula = formula || undefined;
      this.buildDAG();
      this.evaluateAllColumns();
    }
  }

  // Vectorized column formula evaluation
  public async evaluateAllColumns(): Promise<void> {
    if (!this.evalWorker) return;

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    return new Promise<void>((resolve) => {
      this.debounceTimeout = setTimeout(() => {
        this.evalResolve = resolve;
        this.evalWorker!.postMessage({
          type: 'EVALUATE',
          payload: {
            totalRows: this.totalRows,
            evaluationOrder: this.evaluationOrder,
            schemas: this.schemas
          }
        });
      }, 16);
    });
  }

  // Cell level formula evaluator (e.g. SUM range A1:A10)
  public evaluateCellFormula(formula: string): number | string {
    const cleanFormula = formula.substring(1).toUpperCase().trim();
    
    // Check SUM range, e.g. SUM(D1:D100)
    const sumMatch = cleanFormula.match(/^SUM\(([A-J])(\d+):([A-J])(\d+)\)$/);
    if (sumMatch) {
      const colLetterA = sumMatch[1];
      const startRowIdx = parseInt(sumMatch[2]) - 1;
      const colLetterB = sumMatch[3];
      const endRowIdx = parseInt(sumMatch[4]) - 1;

      const colIdxA = colLetterA.charCodeAt(0) - 65;
      const colIdxB = colLetterB.charCodeAt(0) - 65;

      let sum = 0;
      for (let c = colIdxA; c <= colIdxB; c++) {
        const arr = this.columns[c];
        if (arr instanceof Float64Array) {
          const start = Math.max(0, startRowIdx);
          const end = Math.min(this.totalRows - 1, endRowIdx);
          for (let r = start; r <= end; r++) {
            sum += arr[r];
          }
        }
      }
      return sum;
    }

    return '#VALUE!';
  }

  // Get Column Letter from index
  public columnLetter(colIdx: number): string {
    return String.fromCharCode(65 + colIdx);
  }

  // Get Column index from letter
  public columnIdx(letter: string): number {
    return letter.charCodeAt(0) - 65;
  }

  // Get Table structure as a Record of arrays for DuckDB Arrow import
  public getArrowColumns(): Record<string, Float64Array | string[]> {
    const result: Record<string, Float64Array | string[]> = {};
    for (let c = 0; c < this.totalCols; c++) {
      const schema = this.schemas[c];
      if (schema.type === 'number') {
        const arr = new Float64Array(this.columns[c] as Float64Array);
        // Apply overrides
        for (const [key, override] of this.overrides.entries()) {
          const [colStr, rowStr] = key.split(',');
          if (parseInt(colStr) === c) {
            const r = parseInt(rowStr);
            if (override.formula) {
              const evaluated = this.evaluateCellFormula(override.formula);
              arr[r] = typeof evaluated === 'number' ? evaluated : parseFloat(String(evaluated)) || 0;
            } else if (override.value !== undefined) {
              arr[r] = typeof override.value === 'number' ? override.value : parseFloat(String(override.value)) || 0;
            }
          }
        }
        result[schema.name] = arr;
      } else {
        const arr = [...(this.columns[c] as string[])];
        // Apply overrides
        for (const [key, override] of this.overrides.entries()) {
          const [colStr, rowStr] = key.split(',');
          if (parseInt(colStr) === c) {
            const r = parseInt(rowStr);
            if (override.formula) {
              arr[r] = String(this.evaluateCellFormula(override.formula));
            } else if (override.value !== undefined) {
              arr[r] = String(override.value);
            }
          }
        }
        result[schema.name] = arr;
      }
    }
    return result;
  }

  // High performance vectorized Welford statistics computation
  public computeColumnStats(colIdx: number): ColumnStats | null {
    const schema = this.schemas[colIdx];
    if (schema.type !== 'number') return null;

    const dataArr = this.columns[colIdx] as Float64Array;
    let count = 0;
    let mean = 0;
    let m2 = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    // First pass: Welford for Mean and Variance
    for (let r = 0; r < this.totalRows; r++) {
      const val = dataArr[r];
      if (isNaN(val)) continue;

      count++;
      const delta = val - mean;
      mean += delta / count;
      const delta2 = val - mean;
      m2 += delta * delta2;

      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    if (count < 2) {
      return {
        columnName: schema.name,
        count,
        mean: count === 1 ? mean : 0,
        median: count === 1 ? mean : 0,
        stdDev: 0,
        min: count === 1 ? minVal : 0,
        max: count === 1 ? maxVal : 0,
        histogram: new Array(10).fill(0)
      };
    }

    const variance = m2 / (count - 1);
    const stdDev = Math.sqrt(variance);

    // O(N) Select median approximation or sorted median depending on size
    // For benchmark, let's take a sample of 1000 rows to sort, or calculate directly
    let median = mean;
    const sampleSize = Math.min(count, 5000);
    const sample: number[] = [];
    const step = Math.max(1, Math.floor(count / sampleSize));
    
    let sampleIdx = 0;
    for (let r = 0; r < this.totalRows; r += step) {
      const val = dataArr[r];
      if (!isNaN(val)) {
        sample.push(val);
        sampleIdx++;
        if (sampleIdx >= sampleSize) break;
      }
    }
    
    sample.sort((a, b) => a - b);
    if (sample.length > 0) {
      const mid = Math.floor(sample.length / 2);
      median = sample.length % 2 !== 0 ? sample[mid] : (sample[mid - 1] + sample[mid]) / 2;
    }

    // O(1) Histogram Binning
    const histogram = new Array(10).fill(0);
    const binWidth = (maxVal - minVal) / 10;
    
    if (binWidth > 0) {
      for (let r = 0; r < this.totalRows; r++) {
        const val = dataArr[r];
        if (isNaN(val)) continue;
        
        let binIdx = Math.floor((val - minVal) / binWidth);
        if (binIdx >= 10) binIdx = 9;
        if (binIdx < 0) binIdx = 0;
        histogram[binIdx]++;
      }
    }

    return {
      columnName: schema.name,
      count,
      mean,
      median,
      stdDev,
      min: minVal,
      max: maxVal,
      histogram
    };
  }
}
