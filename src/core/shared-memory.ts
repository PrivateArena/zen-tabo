// SharedArrayBuffer zero-copy structure for Zen-Tabo.
// Enables instant, atomic synchronization of scroll coordinates, selection boundaries,
// and engine locks between the UI Thread and Web Worker calculations.

export class SharedGridMemory {
  private sab: SharedArrayBuffer;
  private int32View: Int32Array;

  // Offsets in Int32 index (4 bytes each)
  private static readonly OFF_SCROLL_X = 0;
  private static readonly OFF_SCROLL_Y = 1;
  private static readonly OFF_SEL_COL = 2;
  private static readonly OFF_SEL_ROW = 3;
  private static readonly OFF_TOTAL_ROWS = 4;
  private static readonly OFF_TOTAL_COLS = 5;
  private static readonly OFF_IS_DIRTY = 6;
  private static readonly OFF_LOCK_FLAG = 7;

  constructor(existingBuffer?: SharedArrayBuffer) {
    if (existingBuffer) {
      this.sab = existingBuffer;
    } else {
      // Allocate 32KB for Control Header block
      this.sab = new SharedArrayBuffer(32768);
    }
    this.int32View = new Int32Array(this.sab);
  }

  public getBuffer(): SharedArrayBuffer {
    return this.sab;
  }

  // Atomically get/set scroll X
  public get scrollX(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_SCROLL_X);
  }

  public set scrollX(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_SCROLL_X, val);
  }

  // Atomically get/set scroll Y
  public get scrollY(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_SCROLL_Y);
  }

  public set scrollY(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_SCROLL_Y, val);
  }

  // Atomically get/set selected column
  public get selectedCol(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_SEL_COL);
  }

  public set selectedCol(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_SEL_COL, val);
  }

  // Atomically get/set selected row
  public get selectedRow(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_SEL_ROW);
  }

  public set selectedRow(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_SEL_ROW, val);
  }

  // Get/set total rows
  public get totalRows(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_TOTAL_ROWS);
  }

  public set totalRows(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_TOTAL_ROWS, val);
  }

  // Get/set total cols
  public get totalCols(): number {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_TOTAL_COLS);
  }

  public set totalCols(val: number) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_TOTAL_COLS, val);
  }

  // Get/set isDirty flag
  public get isDirty(): boolean {
    return Atomics.load(this.int32View, SharedGridMemory.OFF_IS_DIRTY) === 1;
  }

  public set isDirty(val: boolean) {
    Atomics.store(this.int32View, SharedGridMemory.OFF_IS_DIRTY, val ? 1 : 0);
  }

  // Fast CAS lock implementation for thread synchronisation
  public lock(): void {
    while (Atomics.compareExchange(this.int32View, SharedGridMemory.OFF_LOCK_FLAG, 0, 1) !== 0) {
      // Spin lock - in real app we could use Atomics.wait()
    }
  }

  public unlock(): void {
    Atomics.store(this.int32View, SharedGridMemory.OFF_LOCK_FLAG, 0);
  }
}
