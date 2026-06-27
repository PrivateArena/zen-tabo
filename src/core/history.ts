export interface SetCellCommand {
  type: 'SET_CELL';
  row: number;
  col: number;
  prevText: string;
  nextText: string;
}

export type Command = SetCellCommand;

export class UndoStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private readonly maxDepth = 100;

  public push(cmd: Command) {
    this.past.push(cmd);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future = []; // Clear redo stack on new action
  }

  public undo(): Command | undefined {
    const cmd = this.past.pop();
    if (cmd) {
      this.future.push(cmd);
    }
    return cmd;
  }

  public redo(): Command | undefined {
    const cmd = this.future.pop();
    if (cmd) {
      this.past.push(cmd);
    }
    return cmd;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public clear() {
    this.past = [];
    this.future = [];
  }
}
