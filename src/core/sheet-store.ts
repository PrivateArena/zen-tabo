import type { ColumnStats } from '../components/Sidebar';

export type ColumnType = 'number' | 'string';

export interface ColumnSchema {
  index: number;
  name: string;
  type: ColumnType;
  formula?: string; // Stored format: e.g. "col_3 * col_4"
  aggregateOp?: 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count';
}

export interface CellOverride {
  value?: string | number;
  formula?: string; // Cell-specific formula override e.g. "=SUM(D1:D100)"
}

export class SheetStore {
  public totalRows = 100000;
  public totalCols = 10;
  
  public columns: (Float64Array | string[])[] = [];
  public schemas: ColumnSchema[] = [];
  public overrides: Map<string, CellOverride> = new Map();
  private evaluationOrder: number[] = [];

  private evalWorker: Worker | null = null;
  private evalResolve: (() => void) | null = null;
  private debounceTimeout: any = null;
  public onRecalculate: (() => void) | null = null;

  public lastAggregates: Record<number, any> = {};
  private sessionID = 0;

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
        const { type, payload } = e.data;
        if (type === 'EVALUATE_DONE') {
          const { sessionID, aggregates } = payload;
          if (sessionID === this.sessionID) {
            this.lastAggregates = aggregates;
            if (this.evalResolve) {
              this.evalResolve();
              this.evalResolve = null;
            }
            if (this.onRecalculate) {
              this.onRecalculate();
            }
          }
        }
      });
    }

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
      { index: 5, name: 'Revenue', type: 'number', formula: 'col_3 * col_4' },
      { index: 6, name: 'TaxRate', type: 'number' },
      { index: 7, name: 'TaxAmount', type: 'number', formula: 'col_5 * col_6' },
      { index: 8, name: 'NetRevenue', type: 'number', formula: 'col_5 - col_7' },
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
    this.lastAggregates = {};
    this.buildDAG();
    this.initEvalWorker();
  }

  public loadMockData(rowCount: number = 100000) {
    this.totalRows = rowCount;
    
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
      
      units[r] = 5 + (r % 150);
      prices[r] = 12.5 + (r % 85) * 2.5;
      taxRates[r] = 0.05 + ((r % 4) * 0.02);
      dates[r] = `2026-06-${String((r % 28) + 1).padStart(2, '0')}`;
    }

    this.overrides.clear();
    this.lastAggregates = {};
    this.initEvalWorker();
    this.evaluateAllColumns();
  }

  public toStoredFormula(displayFormula: string): string {
    let formula = displayFormula.trim();
    if (!formula) return '';
    
    const sortedSchemas = [...this.schemas].sort((a, b) => b.name.length - a.name.length);
    
    for (const schema of sortedSchemas) {
      const escapedName = schema.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
      formula = formula.replace(regex, `col_${schema.index}`);
    }
    
    return formula;
  }

  public toDisplayFormula(storedFormula: string): string {
    let formula = storedFormula.trim();
    if (!formula) return '';
    
    formula = formula.replace(/col_(\d+)/gi, (match, idxStr) => {
      const idx = parseInt(idxStr);
      const schema = this.schemas[idx];
      return schema ? schema.name : match;
    });
    
    return formula;
  }

  public buildDAG(): boolean {
    const adj: Map<number, number[]> = new Map();
    const inDegree: number[] = new Array(this.totalCols).fill(0);

    for (let i = 0; i < this.totalCols; i++) {
      adj.set(i, []);
    }

    this.schemas.forEach(schema => {
      if (schema.formula) {
        const matches = schema.formula.match(/col_\d+/gi) || [];
        matches.forEach(ref => {
          const targetIdx = parseInt(ref.substring(4));
          if (targetIdx >= 0 && targetIdx < this.totalCols && targetIdx !== schema.index) {
            adj.get(targetIdx)!.push(schema.index);
            inDegree[schema.index]++;
          }
        });
      }
    });

    const queue: number[] = [];
    for (let i = 0; i < this.totalCols; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    const order: number[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      adj.get(u)!.forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      });
    }

    const formulaCols = this.schemas.filter(s => s.formula !== undefined).map(s => s.index);
    const hasCycle = formulaCols.some(idx => !order.includes(idx));
    
    if (hasCycle) {
      return false;
    }

    this.evaluationOrder = order;
    return true;
  }

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

    this.evaluateAllColumns();
  }

  public setColumnFormula(colIdx: number, formula: string): boolean {
    if (colIdx >= 0 && colIdx < this.totalCols) {
      const oldFormula = this.schemas[colIdx].formula;
      
      if (!formula) {
        this.schemas[colIdx].formula = undefined;
        this.buildDAG();
        this.evaluateAllColumns();
        return true;
      }
      
      const storedFormula = this.toStoredFormula(formula);
      this.schemas[colIdx].formula = storedFormula;
      
      const ok = this.buildDAG();
      if (!ok) {
        this.schemas[colIdx].formula = oldFormula;
        this.buildDAG();
        return false;
      }
      
      this.evaluateAllColumns();
      return true;
    }
    return false;
  }

  public renameColumn(colIdx: number, newName: string): boolean {
    if (colIdx >= 0 && colIdx < this.totalCols) {
      const cleanName = newName.trim();
      if (!cleanName) return false;
      const exists = this.schemas.some((s, idx) => idx !== colIdx && s.name.toLowerCase() === cleanName.toLowerCase());
      if (exists) return false;

      this.schemas[colIdx].name = cleanName;
      this.evaluateAllColumns();
      return true;
    }
    return false;
  }

  public setColumnAggregate(colIdx: number, op: 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count' | undefined) {
    if (colIdx >= 0 && colIdx < this.totalCols) {
      this.schemas[colIdx].aggregateOp = op;
    }
  }

  public async evaluateAllColumns(): Promise<void> {
    if (!this.evalWorker) return;

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.sessionID++;
    const currentSessionID = this.sessionID;

    return new Promise<void>((resolve) => {
      this.debounceTimeout = setTimeout(() => {
        this.evalResolve = resolve;
        this.evalWorker!.postMessage({
          type: 'EVALUATE',
          payload: {
            totalRows: this.totalRows,
            evaluationOrder: this.evaluationOrder,
            schemas: this.schemas,
            sessionID: currentSessionID
          }
        });
      }, 16);
    });
  }

  public evaluateCellFormula(formula: string): number | string {
    const cleanFormula = formula.substring(1).toUpperCase().trim();
    
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

  public columnLetter(colIdx: number): string {
    return String.fromCharCode(65 + colIdx);
  }

  public columnIdx(letter: string): number {
    return letter.charCodeAt(0) - 65;
  }

  public getArrowColumns(): Record<string, Float64Array | string[]> {
    const result: Record<string, Float64Array | string[]> = {};
    for (let c = 0; c < this.totalCols; c++) {
      const schema = this.schemas[c];
      if (schema.type === 'number') {
        const arr = new Float64Array(this.columns[c] as Float64Array);
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

  public computeColumnStats(colIdx: number): ColumnStats | null {
    const schema = this.schemas[colIdx];
    if (schema.type !== 'number') return null;

    const cached = this.lastAggregates[colIdx];
    if (cached) {
      return cached;
    }

    const dataArr = this.columns[colIdx] as Float64Array;
    let count = 0;
    let mean = 0;
    let m2 = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

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
