// SharedArrayBuffer zero-copy structure for Zen-Tabo.
// Enables instant, atomic synchronization of scroll coordinates, selection boundaries,
// and engine locks between the UI Thread and Web Worker calculations.

export class SharedGridMemory {
  private sab: SharedArrayBuffer | ArrayBuffer;
  private int32View: Int32Array;

  // Offsets in Int32 index (4 bytes each)
  private static readonly OFF_SCROLL_X = 0;
  private static readonly OFF_SCROLL_Y = 1;
  private static readonly OFF_SEL_COL = 2;
  private static readonly OFF_SEL_ROW = 3;
  private static readonly OFF_TOTAL_ROWS = 4;
  private static readonly OFF_TOTAL_COLS = 5;
  private static readonly OFF_IS_DIRTY = 6;

  constructor(existingBuffer?: SharedArrayBuffer | ArrayBuffer) {
    if (existingBuffer) {
      this.sab = existingBuffer;
    } else {
      if (typeof SharedArrayBuffer !== 'undefined') {
        this.sab = new SharedArrayBuffer(32768);
      } else {
        console.warn('SharedArrayBuffer is not supported in this environment. Falling back to ArrayBuffer.');
        this.sab = new ArrayBuffer(32768);
      }
    }
    this.int32View = new Int32Array(this.sab);
  }

  public getBuffer(): SharedArrayBuffer | ArrayBuffer {
    return this.sab;
  }

  private getValue(offset: number): number {
    if (typeof SharedArrayBuffer !== 'undefined' && this.sab instanceof SharedArrayBuffer) {
      return Atomics.load(this.int32View, offset);
    }
    return this.int32View[offset];
  }

  private setValue(offset: number, val: number): void {
    if (typeof SharedArrayBuffer !== 'undefined' && this.sab instanceof SharedArrayBuffer) {
      Atomics.store(this.int32View, offset, val);
    } else {
      this.int32View[offset] = val;
    }
  }

  // Atomically get/set scroll X
  public get scrollX(): number {
    return this.getValue(SharedGridMemory.OFF_SCROLL_X);
  }

  public set scrollX(val: number) {
    this.setValue(SharedGridMemory.OFF_SCROLL_X, val);
  }

  // Atomically get/set scroll Y
  public get scrollY(): number {
    return this.getValue(SharedGridMemory.OFF_SCROLL_Y);
  }

  public set scrollY(val: number) {
    this.setValue(SharedGridMemory.OFF_SCROLL_Y, val);
  }

  // Atomically get/set selected column
  public get selectedCol(): number {
    return this.getValue(SharedGridMemory.OFF_SEL_COL);
  }

  public set selectedCol(val: number) {
    this.setValue(SharedGridMemory.OFF_SEL_COL, val);
  }

  // Atomically get/set selected row
  public get selectedRow(): number {
    return this.getValue(SharedGridMemory.OFF_SEL_ROW);
  }

  public set selectedRow(val: number) {
    this.setValue(SharedGridMemory.OFF_SEL_ROW, val);
  }

  // Get/set total rows
  public get totalRows(): number {
    return this.getValue(SharedGridMemory.OFF_TOTAL_ROWS);
  }

  public set totalRows(val: number) {
    this.setValue(SharedGridMemory.OFF_TOTAL_ROWS, val);
  }

  // Get/set total cols
  public get totalCols(): number {
    return this.getValue(SharedGridMemory.OFF_TOTAL_COLS);
  }

  public set totalCols(val: number) {
    this.setValue(SharedGridMemory.OFF_TOTAL_COLS, val);
  }

  // Get/set isDirty flag
  public get isDirty(): boolean {
    return this.getValue(SharedGridMemory.OFF_IS_DIRTY) === 1;
  }

  public set isDirty(val: boolean) {
    this.setValue(SharedGridMemory.OFF_IS_DIRTY, val ? 1 : 0);
  }

}
