export interface SQLResult {
  columns: string[];
  rows: any[][];
  errorMessage?: string;
  executionTimeMs?: number;
}

export class DbEngine {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private queryResolve: ((res: SQLResult) => void) | null = null;
  private registerResolve: (() => void) | null = null;

  constructor() {
    // Instantiate the worker using Vite's URL asset protocol
    this.worker = new Worker(
      new URL('./db-engine.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const initHandler = (e: MessageEvent) => {
        const { type, message } = e.data;
        if (type === 'READY') {
          this.worker.removeEventListener('message', initHandler);
          this.worker.addEventListener('message', this.handleMessage.bind(this));
          resolve();
        } else if (type === 'ERROR') {
          this.worker.removeEventListener('message', initHandler);
          reject(new Error(message));
        }
      };
      this.worker.addEventListener('message', initHandler);
    });

    // Send a trigger message to start lazy initialization in the worker
    this.worker.postMessage({ type: 'INIT' });
  }

  public async waitReady(): Promise<void> {
    return this.readyPromise;
  }

  public async registerTable(name: string, data: any[]): Promise<void> {
    await this.readyPromise;
    return new Promise<void>((resolve) => {
      this.registerResolve = resolve;
      this.worker.postMessage({
        type: 'REGISTER_TABLE',
        payload: { name, data }
      });
    });
  }

  public async query(sql: string): Promise<SQLResult> {
    await this.readyPromise;
    return new Promise<SQLResult>((resolve) => {
      this.queryResolve = resolve;
      this.worker.postMessage({
        type: 'QUERY',
        payload: { sql }
      });
    });
  }

  private handleMessage(e: MessageEvent): void {
    const { type, rows, executionTimeMs, message } = e.data;
    
    if (type === 'TABLE_REGISTERED') {
      if (this.registerResolve) {
        this.registerResolve();
        this.registerResolve = null;
      }
    } else if (type === 'RESULT') {
      if (this.queryResolve) {
        if (rows.length === 0) {
          this.queryResolve({ columns: [], rows: [], executionTimeMs });
        } else {
          const columns = Object.keys(rows[0]);
          const rowData = rows.map((row: any) => columns.map(col => row[col]));
          this.queryResolve({ columns, rows: rowData, executionTimeMs });
        }
        this.queryResolve = null;
      }
    } else if (type === 'ERROR') {
      if (this.queryResolve) {
        this.queryResolve({
          columns: [],
          rows: [],
          errorMessage: message
        });
        this.queryResolve = null;
      }
    }
  }

  public terminate(): void {
    this.worker.terminate();
  }
}
