// Phase 2: Undo / redo command stack
// TODO: implement command pattern; hook into state.setStep mutations

const stack = [];
let cursor = -1;

export function push(/* command */) {
  console.warn('Phase 2: undo/redo not yet implemented');
}

export function undo() {
  console.warn('Phase 2: undo not yet implemented');
}

export function redo() {
  console.warn('Phase 2: redo not yet implemented');
}
