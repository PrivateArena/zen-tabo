let buffers: Record<number, Float64Array> = {};

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === 'INIT_BUFFERS') {
    const { cols } = payload;
    buffers = {};
    for (const key of Object.keys(cols)) {
      const idx = Number(key);
      buffers[idx] = new Float64Array(cols[idx]);
    }
  } else if (type === 'EVALUATE') {
    const { totalRows, evaluationOrder, schemas } = payload;
    
    // Recalculate each formula column in topological order
    for (const colIdx of evaluationOrder) {
      const schema = schemas[colIdx];
      if (!schema || !schema.formula) continue;

      const dest = buffers[colIdx];
      if (!dest) continue;

      const parts = schema.formula.split(/\s+([\+\-\*\/])\s+/);
      if (parts.length === 3) {
        const colAName = parts[0].trim();
        const op = parts[1].trim();
        const colBName = parts[2].trim();

        const colA = schemas.find((s: any) => s.name === colAName);
        const colB = schemas.find((s: any) => s.name === colBName);

        if (colA && colB) {
          const arrA = buffers[colA.index];
          const arrB = buffers[colB.index];

          if (arrA && arrB) {
            if (op === '*') {
              for (let r = 0; r < totalRows; r++) {
                dest[r] = arrA[r] * arrB[r];
              }
            } else if (op === '-') {
              for (let r = 0; r < totalRows; r++) {
                dest[r] = arrA[r] - arrB[r];
              }
            } else if (op === '+') {
              for (let r = 0; r < totalRows; r++) {
                dest[r] = arrA[r] + arrB[r];
              }
            } else if (op === '/') {
              for (let r = 0; r < totalRows; r++) {
                dest[r] = arrB[r] !== 0 ? arrA[r] / arrB[r] : 0;
              }
            }
          }
        }
      }
    }
    
    self.postMessage({ type: 'EVALUATE_DONE' });
  }
};
