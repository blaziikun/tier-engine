// src/core/history.ts  (tier-engine/core)
// ─────────────────────────────────────────────────────────────────────────────
//  Undo and redo. Each step is a JSON copy of whatever `capture` returns, at
//  most `limit` steps back; `restore` puts one back. The board makes one for
//  its tiers and layout, and an app adds its own fields to the same steps
//  (its look, say, or groupings of items).
//
//  A step can also carry a mark (a deletion's number, say): stepping across
//  it tells `restore` which side of the mark it lands on, so the app can bring
//  deleted things back or delete them again.
// ─────────────────────────────────────────────────────────────────────────────
import { isRecord } from './checks';

/** Which side of a marked change a step is: just before it (`before`: true) or just after it. */
export interface StepMark {
    mark: number;
    before: boolean;
}

export interface HistoryOptions {
    /** The state a step keeps: anything JSON can hold. */
    capture: () => unknown;
    /** Puts a captured state back. `crossed` is set when the step was marked: the side being restored to. */
    restore: (saved: unknown, crossed: StepMark | undefined) => void;
    /** How many steps back (80 if not given). */
    limit?: number;
}

/** What undo or redo did: nothing (there was no step), or restored one (and whether it crossed a mark). */
export type StepResult = { done: false } | { done: true; crossed?: StepMark };

export interface History {
    /** Call before a change: records how things are now. `mark`: this change is a marked one (or undoes one). */
    push(mark?: StepMark): void;
    /** Several changes as one step. */
    asOneStep<T>(change: () => T): T;
    undo(): StepResult;
    redo(): StepResult;
    /** How things are now, as a step to push later (an editor that records a step only if something changed). */
    checkpoint(): string;
    /** Pushes a step from checkpoint() (clears redo, as a change does). */
    pushCheckpoint(step: string): void;
    /** Drops the newest undo step without restoring it (a change that turned out to change nothing). */
    discardLast(): void;
    /** Forgets every step (another list opened). */
    clear(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    /** True when the newest undo step is the moment just before `mark` (undoing it is the same as reversing that change). */
    isLastStepBefore(mark: number): boolean;
}

const readMark = (step: unknown): StepMark | undefined =>
    isRecord(step) && Number.isInteger(step.mark) ? { mark: Number(step.mark), before: step.before === true } : undefined;

export function createHistory({ capture, restore, limit = 80 }: HistoryOptions): History {
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    let lockDepth = 0;
    const snapshot = (mark?: StepMark): string => JSON.stringify({ state: capture(), ...(mark ? mark : {}) });

    function pushStep(step: string): void {
        if (lockDepth) return;
        undoStack.push(step);
        if (undoStack.length > limit) undoStack.shift();
        redoStack.length = 0;
    }
    const push = (mark?: StepMark): void => pushStep(snapshot(mark));

    function step(from: string[], to: string[]): StepResult {
        const saved = from.pop();
        if (saved == null) return { done: false };
        const parsed: unknown = JSON.parse(saved);
        const mark = readMark(parsed);
        // the state being left is on the other side of the same mark
        to.push(snapshot(mark && { mark: mark.mark, before: !mark.before }));
        restore(isRecord(parsed) ? parsed.state : undefined, mark);
        return mark ? { done: true, crossed: mark } : { done: true };
    }

    return {
        push,
        asOneStep<T>(change: () => T): T {
            push();
            lockDepth++;
            try {
                return change();
            } finally {
                lockDepth--;
            }
        },
        checkpoint: () => snapshot(),
        pushCheckpoint: pushStep,
        discardLast() {
            undoStack.pop();
        },
        undo: () => step(undoStack, redoStack),
        redo: () => step(redoStack, undoStack),
        clear() {
            undoStack.length = 0;
            redoStack.length = 0;
        },
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
        isLastStepBefore(mark: number): boolean {
            const last = undoStack.at(-1);
            if (last == null) return false;
            const found = readMark(JSON.parse(last));
            return found?.mark === mark && found.before;
        },
    };
}
