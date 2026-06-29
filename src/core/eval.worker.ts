let buffers: Record<number, Float64Array> = {};

export interface Token {
  type: 'number' | 'variable' | 'operator' | 'lparen' | 'rparen';
  value: string;
}

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  
  while (i < formula.length) {
    const char = formula[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    
    // Parens
    if (char === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i++;
      continue;
    }
    
    // Operators (except minus)
    if (/[+*/]/.test(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }
    
    // Minus can be unary or binary
    if (char === '-') {
      const prev = tokens[tokens.length - 1];
      const isUnary = !prev || prev.type === 'operator' || prev.type === 'lparen';
      tokens.push({ type: 'operator', value: isUnary ? 'u-' : '-' });
      i++;
      continue;
    }
    
    // Variables like col_0, col_12
    if (formula.slice(i).toLowerCase().startsWith('col_')) {
      let varStr = 'col_';
      i += 4;
      while (i < formula.length && /[0-9]/.test(formula[i])) {
        varStr += formula[i];
        i++;
      }
      tokens.push({ type: 'variable', value: varStr });
      continue;
    }
    
    // Numbers
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      let dotCount = 0;
      while (i < formula.length && /[0-9.]/.test(formula[i])) {
        if (formula[i] === '.') {
          dotCount++;
          if (dotCount > 1) break;
        }
        numStr += formula[i];
        i++;
      }
      tokens.push({ type: 'number', value: numStr });
      continue;
    }
    
    // Skip invalid chars
    i++;
  }
  return tokens;
}

export function shuntingYard(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];
  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'u-': 3
  };
  
  for (const token of tokens) {
    if (token.type === 'number' || token.type === 'variable') {
      outputQueue.push(token);
    } else if (token.type === 'operator') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type === 'operator' &&
        precedence[operatorStack[operatorStack.length - 1].value] >= precedence[token.value]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    } else if (token.type === 'lparen') {
      operatorStack.push(token);
    } else if (token.type === 'rparen') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'lparen') {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.pop();
    }
  }
  
  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop()!);
  }
  
  return outputQueue;
}

function evaluateRPN(rpn: Token[], rowIdx: number, localBuffers: Record<number, Float64Array>): number {
  const stack: number[] = [];
  
  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(parseFloat(token.value) || 0);
    } else if (token.type === 'variable') {
      const colIdx = parseInt(token.value.substring(4));
      const arr = localBuffers[colIdx];
      const val = arr ? arr[rowIdx] : 0;
      stack.push(isNaN(val) ? 0 : val);
    } else if (token.type === 'operator') {
      if (token.value === 'u-') {
        const val = stack.pop() ?? 0;
        stack.push(-val);
      } else {
        const b = stack.pop() ?? 0;
        const a = stack.pop() ?? 0;
        switch (token.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/': stack.push(b !== 0 ? a / b : 0); break;
        }
      }
    }
  }
  
  const finalVal = stack[0] ?? 0;
  return isNaN(finalVal) ? 0 : finalVal;
}

function calculateAggregates(arr: Float64Array, totalRows: number, columnName: string) {
  let count = 0;
  let mean = 0;
  let m2 = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  
  const validValues = new Float64Array(totalRows);
  
  for (let r = 0; r < totalRows; r++) {
    const val = arr[r];
    if (isNaN(val)) continue;
    
    count++;
    const delta = val - mean;
    mean += delta / count;
    const delta2 = val - mean;
    m2 += delta * delta2;
    
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    validValues[count - 1] = val;
  }
  
  if (count === 0) {
    return {
      columnName,
      count: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      histogram: new Array(10).fill(0)
    };
  }
  
  const variance = count > 1 ? m2 / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);
  
  const sortedValues = validValues.subarray(0, count);
  sortedValues.sort();
  
  let median = 0;
  const mid = Math.floor(count / 2);
  if (count % 2 !== 0) {
    median = sortedValues[mid];
  } else {
    median = (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  
  const histogram = new Array(10).fill(0);
  const binWidth = (maxVal - minVal) / 10;
  if (binWidth > 0) {
    for (let i = 0; i < count; i++) {
      const val = sortedValues[i];
      let binIdx = Math.floor((val - minVal) / binWidth);
      if (binIdx >= 10) binIdx = 9;
      if (binIdx < 0) binIdx = 0;
      histogram[binIdx]++;
    }
  }
  
  return {
    columnName,
    count,
    mean,
    median,
    stdDev,
    min: minVal,
    max: maxVal,
    histogram
  };
}

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
    const { totalRows, evaluationOrder, schemas, sessionID } = payload;
    
    // Recalculate each formula column in topological order
    for (const colIdx of evaluationOrder) {
      const schema = schemas[colIdx];
      if (!schema || !schema.formula) continue;

      const dest = buffers[colIdx];
      if (!dest) continue;

      const tokens = tokenize(schema.formula);
      const rpn = shuntingYard(tokens);

      for (let r = 0; r < totalRows; r++) {
        dest[r] = evaluateRPN(rpn, r, buffers);
      }
    }

    // Compute aggregates for all numeric columns
    const aggregates: Record<number, any> = {};
    for (const schema of schemas) {
      if (schema.type === 'number' && buffers[schema.index]) {
        aggregates[schema.index] = calculateAggregates(buffers[schema.index], totalRows, schema.name);
      }
    }
    
    self.postMessage({
      type: 'EVALUATE_DONE',
      payload: {
        sessionID,
        aggregates
      }
    });
  }
};
