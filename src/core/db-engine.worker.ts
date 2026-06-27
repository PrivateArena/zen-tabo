import * as duckdb from '@duckdb/duckdb-wasm';
import { tableFromArrays } from 'apache-arrow';

const DUCKDB_VERSION = '1.28.0'; // Pinned stable version
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist`;

const CDN_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: `${CDN_BASE}/duckdb-mvp.wasm`,
    mainWorker: `${CDN_BASE}/duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${CDN_BASE}/duckdb-eh.wasm`,
    mainWorker: `${CDN_BASE}/duckdb-browser-eh.worker.js`,
  },
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

async function initDuckDB(): Promise<void> {
  const bundle = await duckdb.selectBundle(CDN_BUNDLES);
  
  // Create nested worker via Blob URL
  const workerUrl = URL.createObjectURL(
    new Blob(
      [`importScripts("${bundle.mainWorker!}");`],
      { type: 'application/javascript' }
    )
  );
  
  const nestedWorker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  
  db = new duckdb.AsyncDuckDB(logger, nestedWorker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  
  conn = await db.connect();
}

async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  if (!conn) throw new Error('Database is not initialised');
  
  const arrowResult = await conn.query(sql);
  
  return arrowResult.toArray().map((row) =>
    Object.fromEntries(
      arrowResult.schema.fields.map((field) => [
        field.name,
        row[field.name as keyof typeof row] ?? null,
      ])
    )
  );
}

async function registerTable(name: string, columns: Record<string, Float64Array | string[]>): Promise<void> {
  if (!conn || !db) throw new Error('Database is not initialised');
  
  // Drop table if exists
  await conn.query(`DROP TABLE IF EXISTS ${name}`);
  
  if (Object.keys(columns).length === 0) return;
  
  // Create Arrow table from arrays
  const arrowTable = tableFromArrays(columns);
  
  // Insert table
  await conn.insertArrowTable(arrowTable as any, { name, create: true });
}

// Request Queue to serialize database operations
const queue: Array<{ id: string; type: string; payload: any }> = [];
let busy = false;

async function processQueue() {
  if (busy || queue.length === 0) return;
  busy = true;
  
  const request = queue.shift()!;
  const { id, type, payload } = request;
  
  try {
    if (initPromise) {
      await initPromise;
    }
    
    if (type === 'REGISTER_TABLE') {
      await registerTable(payload.name, payload.columns);
      self.postMessage({ type: 'TABLE_REGISTERED', id, name: payload.name });
    } else if (type === 'QUERY') {
      const startTime = performance.now();
      const rows = await runQuery(payload.sql);
      const endTime = performance.now();
      self.postMessage({ 
        type: 'RESULT', 
        id,
        rows, 
        executionTimeMs: endTime - startTime 
      });
    }
  } catch (err) {
    self.postMessage({ 
      type: 'ERROR', 
      id,
      message: err instanceof Error ? err.message : String(err) 
    });
  } finally {
    busy = false;
    processQueue();
  }
}

self.onmessage = (event: MessageEvent) => {
  const { type, id, payload } = event.data;
  
  if (type === 'INIT') {
    if (!initPromise) {
      initPromise = initDuckDB().then(() => {
        self.postMessage({ type: 'READY' });
      });
    }
    return;
  }
  
  queue.push({ id, type, payload });
  processQueue();
};
