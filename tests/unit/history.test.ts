// Undo and redo: steps, the limit, one step for several changes, and marks (a deletion that undo brings back).
import { describe, expect, it } from 'vitest';
import { createHistory, type StepMark } from '../../src/core';

function setup(limit?: number) {
    const model = { value: 0 };
    const crossings: (StepMark | undefined)[] = [];
    const history = createHistory({
        capture: () => ({ value: model.value }),
        restore: (saved, crossed) => {
            model.value = (saved as { value: number }).value;
            crossings.push(crossed);
        },
        limit,
    });
    const change = (value: number, mark?: StepMark) => {
        history.push(mark);
        model.value = value;
    };
    return { model, history, change, crossings };
}

describe('undo and redo', () => {
    it('steps back and forward, and says when there is nothing to do', () => {
        const { model, history, change } = setup();
        expect(history.undo()).toEqual({ done: false });
        change(1);
        change(2);
        expect(history.undo()).toEqual({ done: true });
        expect(model.value).toBe(1);
        expect(history.undo().done).toBe(true);
        expect(model.value).toBe(0);
        expect(history.redo().done).toBe(true);
        expect(model.value).toBe(1);
        expect([history.canUndo(), history.canRedo()]).toEqual([true, true]);
    });

    it('drops redo after a new change, and keeps at most `limit` steps', () => {
        const { model, history, change } = setup(3);
        for (let i = 1; i <= 5; i++) change(i);
        history.undo();
        change(9);
        expect(history.canRedo()).toBe(false);
        while (history.undo().done);
        expect(model.value).toBe(2); // 3 steps back from 9: 4, 3, 2
    });

    it('counts several changes as one step', () => {
        const { model, history, change } = setup();
        history.asOneStep(() => {
            change(1);
            change(2);
        });
        history.undo();
        expect(model.value).toBe(0);
        expect(history.canUndo()).toBe(false);
    });

    it('tells restore which side of a marked change it lands on, both ways', () => {
        const { history, change, crossings } = setup();
        change(1, { mark: 7, before: true }); // the step before deletion 7
        expect(history.isLastStepBefore(7)).toBe(true);
        expect(history.isLastStepBefore(8)).toBe(false);
        history.undo();
        history.redo();
        expect(crossings).toEqual([
            { mark: 7, before: true },
            { mark: 7, before: false },
        ]);
    });

    it('pushes a checkpoint taken earlier, and drops a step that changed nothing', () => {
        const { model, history, change } = setup();
        const before = history.checkpoint();
        model.value = 5;
        history.pushCheckpoint(before);
        history.undo();
        expect(model.value).toBe(0);
        change(3);
        history.discardLast();
        expect(history.canUndo()).toBe(false);
    });

    it('forgets everything on clear', () => {
        const { history, change } = setup();
        change(1);
        history.clear();
        expect([history.canUndo(), history.canRedo()]).toEqual([false, false]);
    });
});
