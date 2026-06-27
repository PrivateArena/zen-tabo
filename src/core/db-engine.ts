export interface SQLResult {
  columns: string[];
  rows: any[][];
  errorMessage?: string;
  executionTimeMs?: number;
}

export class DbEngine {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private pendingRequests = new Map<string, { 
    resolve: (res: any) => void;
    reject: (err: Error) => void;
  }>();
  private nextRequestId = 0;

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

  public async registerTable(name: string, columns: Record<string, Float64Array | string[]>): Promise<void> {
    await this.readyPromise;
    return new Promise<void>((resolve, reject) => {
      const id = String(this.nextRequestId++);
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({
        type: 'REGISTER_TABLE',
        id,
        payload: { name, columns }
      });
    });
  }

  public async query(sql: string): Promise<SQLResult> {
    await this.readyPromise;
    return new Promise<SQLResult>((resolve, reject) => {
      const id = String(this.nextRequestId++);
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({
        type: 'QUERY',
        id,
        payload: { sql }
      });
    });
  }

  private handleMessage(e: MessageEvent): void {
    const { type, id, rows, executionTimeMs, message } = e.data;
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);

    if (type === 'TABLE_REGISTERED') {
      pending.resolve(undefined);
    } else if (type === 'RESULT') {
      if (rows.length === 0) {
        pending.resolve({ columns: [], rows: [], executionTimeMs });
      } else {
        const columns = Object.keys(rows[0]);
        const rowData = rows.map((row: any) => columns.map(col => row[col]));
        pending.resolve({ columns, rows: rowData, executionTimeMs });
      }
    } else if (type === 'ERROR') {
      pending.resolve({
        columns: [],
        rows: [],
        errorMessage: message
      });
    }
  }

  public terminate(): void {
    this.worker.terminate();
  }
}
