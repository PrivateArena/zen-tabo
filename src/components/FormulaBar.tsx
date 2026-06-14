import type { Component, Accessor } from 'solid-js';

interface FormulaBarProps {
  selectedCell: Accessor<{ row: number; col: number } | null>;
  formulaText: Accessor<string>;
  setFormulaText: (val: string) => void;
  onFormulaSubmit: () => void;
  columnLetter: (colIdx: number) => string;
}

export const FormulaBar: Component<FormulaBarProps> = (props) => {
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

  return (
    <div class="formula-bar">
      <div class="formula-label" title="Selected Cell Coordinate">
        {cellAddress()}
      </div>
      <div style="color: var(--text-muted); font-weight: bold; font-size: 0.9rem; user-select: none;">
        fx
      </div>
      <div class="formula-input-wrapper">
        <input
          type="text"
          class="formula-input"
          value={props.formulaText()}
          onInput={(e) => props.setFormulaText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter values, text, or formulas like =SUM(A1:A10)..."
        />
      </div>
    </div>
  );
};
