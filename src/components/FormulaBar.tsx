import { createSignal, Show, For } from 'solid-js';
import type { Component, Accessor } from 'solid-js';
import type { ColumnSchema } from '../core/sheet-store';

interface FormulaBarProps {
  selectedCell: Accessor<{ row: number; col: number } | null>;
  formulaText: Accessor<string>;
  setFormulaText: (val: string) => void;
  onFormulaSubmit: () => void;
  columnLetter: (colIdx: number) => string;
  schemas: ColumnSchema[];
  onSetColumnFormula: (colIdx: number, formula: string) => boolean;
  showWizard: Accessor<boolean>;
  setShowWizard: (val: boolean) => void;
}

export const FormulaBar: Component<FormulaBarProps> = (props) => {
  const [colA, setColA] = createSignal('');
  const [op, setOp] = createSignal('*');
  const [colBType, setColBType] = createSignal<'column' | 'constant'>('column');
  const [colBVal, setColBVal] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');

  const cellAddress = () => {
    const cell = props.selectedCell();
    if (!cell) return '---';
    return `${props.columnLetter(cell.col)}${cell.row + 1}`;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      props.onFormulaSubmit();
    }
  };

  const numericColumns = () => {
    return props.schemas.filter(s => s.type === 'number');
  };

  const applyWizardFormula = () => {
    const cell = props.selectedCell();
    if (!cell) return;

    if (!colA()) {
      setErrorMsg('Please select a starting column.');
      return;
    }

    let rightSide = '';
    if (colBType() === 'column') {
      if (!colBVal()) {
        setErrorMsg('Please select the second column.');
        return;
      }
      rightSide = colBVal();
    } else {
      if (!colBVal() || isNaN(Number(colBVal()))) {
        setErrorMsg('Please enter a valid number.');
        return;
      }
      rightSide = colBVal();
    }

    const newFormula = `${colA()} ${op()} ${rightSide}`;
    
    // Set formula using parent store handler
    const ok = props.onSetColumnFormula(cell.col, newFormula);
    if (!ok) {
      setErrorMsg('Circular dependency detected. Calculation rolled back.');
    } else {
      setErrorMsg('');
      props.setShowWizard(false);
      props.setFormulaText('=' + newFormula);
    }
  };

  const clearFormula = () => {
    const cell = props.selectedCell();
    if (!cell) return;
    props.onSetColumnFormula(cell.col, '');
    props.setFormulaText('');
    setErrorMsg('');
    props.setShowWizard(false);
  };

  return (
    <div class="formula-bar-container" style="display: flex; flex-direction: column; width: 100%;">
      <div class="formula-bar" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #161922; border-bottom: 1px solid #232733; height: 38px; box-sizing: border-box;">
        <div class="formula-label" title="Selected Cell Coordinate" style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; background: #1c1f2b; padding: 3px 8px; border-radius: 4px; color: hsl(150, 60%, 55%); min-width: 45px; text-align: center; border: 1px solid #232733; user-select: none;">
          {cellAddress()}
        </div>
        <div style="color: var(--text-muted); font-weight: bold; font-size: 0.9rem; user-select: none; font-style: italic; color: hsl(220, 10%, 50%); margin: 0 4px;">
          fx
        </div>
        <div class="formula-input-wrapper" style="flex: 1; display: flex; align-items: center; background: #0f1117; border: 1px solid #232733; border-radius: 4px; padding: 0 8px; height: 26px;">
          <input
            type="text"
            class="formula-input"
            value={props.formulaText()}
            onInput={(e) => props.setFormulaText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter value, or formula (e.g. =Units * Price)"
            style="width: 100%; border: none; background: transparent; color: white; outline: none; font-size: 0.82rem; font-family: 'JetBrains Mono', monospace;"
          />
        </div>
        <button
          onClick={() => {
            setErrorMsg('');
            props.setShowWizard(!props.showWizard());
          }}
          class="wizard-btn"
          style={`background: ${props.showWizard() ? 'rgba(150, 60, 55, 0.2)' : '#1c1f2b'}; color: ${props.showWizard() ? 'var(--text-accent)' : 'white'}; border: 1px solid ${props.showWizard() ? 'var(--text-accent)' : '#232733'}; border-radius: 4px; padding: 3px 10px; font-size: 0.78rem; cursor: pointer; font-family: Outfit, sans-serif; display: flex; align-items: center; gap: 4px; height: 26px; transition: all 0.15s ease;`}
        >
          🧮 Math Wizard
        </button>
      </div>

      <Show when={props.showWizard()}>
        <div class="formula-wizard" style="background: #12151d; border-bottom: 1px solid #232733; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; animation: slideDown 0.2s ease-out;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 0.8rem; color: #fff;">
            <span>Calculate column <strong>{props.columnLetter(props.selectedCell()?.col ?? 0)}</strong> as:</span>
            
            {/* Column A selector */}
            <select
              value={colA()}
              onChange={(e) => setColA(e.currentTarget.value)}
              style="background: #1c1f2b; color: white; border: 1px solid #232733; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; outline: none;"
            >
              <option value="">-- Choose Column --</option>
              <For each={numericColumns()}>
                {(col) => <option value={col.name}>{col.name}</option>}
              </For>
            </select>

            {/* Operator selector */}
            <select
              value={op()}
              onChange={(e) => setOp(e.currentTarget.value)}
              style="background: #1c1f2b; color: white; border: 1px solid #232733; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; outline: none;"
            >
              <option value="+">+</option>
              <option value="-">-</option>
              <option value="*">×</option>
              <option value="/">÷</option>
            </select>

            {/* Column B Type toggle */}
            <select
              value={colBType()}
              onChange={(e) => {
                setColBType(e.currentTarget.value as 'column' | 'constant');
                setColBVal('');
              }}
              style="background: #1c1f2b; color: white; border: 1px solid #232733; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; outline: none;"
            >
              <option value="column">Another Column</option>
              <option value="constant">Fixed Number</option>
            </select>

            {/* Column B selector or text input */}
            <Show
              when={colBType() === 'column'}
              fallback={
                <input
                  type="text"
                  placeholder="e.g. 1.12"
                  value={colBVal()}
                  onInput={(e) => setColBVal(e.currentTarget.value)}
                  style="background: #1c1f2b; color: white; border: 1px solid #232733; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; width: 80px; outline: none;"
                />
              }
            >
              <select
                value={colBVal()}
                onChange={(e) => setColBVal(e.currentTarget.value)}
                style="background: #1c1f2b; color: white; border: 1px solid #232733; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; outline: none;"
              >
                <option value="">-- Choose Column --</option>
                <For each={numericColumns()}>
                  {(col) => <option value={col.name}>{col.name}</option>}
                </For>
              </select>
            </Show>

            <button
              onClick={applyWizardFormula}
              style="background: hsl(150, 60%, 45%); color: white; border: none; border-radius: 4px; padding: 5px 12px; font-size: 0.8rem; cursor: pointer; font-weight: bold; margin-left: auto;"
            >
              Apply Calculation
            </button>

            <button
              onClick={clearFormula}
              style="background: transparent; color: #b0b3c0; border: 1px solid #444; border-radius: 4px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer;"
            >
              Clear Formula
            </button>
          </div>

          <Show when={errorMsg()}>
            <div style="color: hsl(0, 70%, 60%); font-size: 0.75rem; margin-top: 4px;">
              ⚠️ {errorMsg()}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
