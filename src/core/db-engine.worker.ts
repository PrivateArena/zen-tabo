import * as duckdb from '@duckdb/duckdb-wasm';

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

async function registerTable(name: string, data: any[]): Promise<void> {
  if (!conn || !db) throw new Error('Database is not initialised');
  
  // Drop table if exists
  await conn.query(`DROP TABLE IF EXISTS ${name}`);
  
  if (data.length === 0) return;
  
  // Create and insert table data
  // Extract schema
  const first = data[0];
  const columns = Object.keys(first);
  const types = columns.map(col => {
    const val = first[col];
    if (typeof val === 'number') {
      return `${col} DOUBLE`;
    }
    return `${col} VARCHAR`;
  });
  
  await conn.query(`CREATE TABLE ${name} (${types.join(', ')})`);
  
  // Insert in batches of 10,000 for high performance
  const batchSize = 10000;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const valuesList = batch.map(row => {
      const vals = columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(', ')})`;
    });
    
    await conn.query(`INSERT INTO ${name} VALUES ${valuesList.join(', ')}`);
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;
  
  if (!initPromise) {
    initPromise = initDuckDB().then(() => {
      self.postMessage({ type: 'READY' });
    });
  }
  
  try {
    await initPromise;
    
    if (type === 'REGISTER_TABLE') {
      await registerTable(payload.name, payload.data);
      self.postMessage({ type: 'TABLE_REGISTERED', name: payload.name });
    } else if (type === 'QUERY') {
      const startTime = performance.now();
      const rows = await runQuery(payload.sql);
      const endTime = performance.now();
      self.postMessage({ 
        type: 'RESULT', 
        rows, 
        executionTimeMs: endTime - startTime 
      });
    }
  } catch (err) {
    self.postMessage({ 
      type: 'ERROR', 
      message: err instanceof Error ? err.message : String(err) 
    });
  }
};
