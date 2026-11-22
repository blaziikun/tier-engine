// Group ranking: scores by tier, combining people's lists, how far apart they placed things,
// and how close each person was to the group.
import { describe, expect, it } from 'vitest';
import {
    agreementExtremes,
    closestPerson,
    combineRankings,
    foldName,
    type GroupRanking,
    groupSizeProblem,
    inTiers,
    nearestTier,
    type RankedEntry,
    type RankedList,
    tierScore,
} from '../../src/core';

const COLOURS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#bfff7f', '#7fbfff'];

interface Tier {
    label: string;
    subtitle: string;
    color: string;
    textColor: string;
}

/** A person's list from tiers of names, matched across lists by folded name (as an app might). */
function fruit(title: string, tiers: Record<string, string[]>): RankedList<RankedEntry, Tier> {
    const labels = Object.keys(tiers);
    const items = new Map<string, RankedEntry>();
    labels.forEach((label, index) => {
        for (const name of tiers[label]!) {
            const key = foldName(name);
            if (!items.has(key)) items.set(key, { key, name, score: tierScore(index, labels.length) });
        }
    });
    return {
        title,
        tiers: labels.map((label, index) => ({ label, subtitle: '', color: COLOURS[index % COLOURS.length]!, textColor: '' })),
        items: [...items.values()],
    };
}

/** Each group tier's label with the names in it, in order. */
const placements = (group: GroupRanking<RankedEntry, Tier>): Record<string, string[]> =>
    Object.fromEntries(
        group.tiers.map((tier, index) => [tier.label, group.items.filter((item) => item.tier === index).map((item) => item.name)]),
    );

const itemNamed = (group: GroupRanking<RankedEntry, Tier>, name: string) => group.items.find((item) => item.name === name)!;

describe('scores and tiers', () => {
    it('spaces tier scores evenly from 1 at the top to 0 at the bottom; a lone tier scores 1', () => {
        expect([0, 1, 2, 3, 4].map((index) => tierScore(index, 5))).toEqual([1, 0.75, 0.5, 0.25, 0]);
        expect(tierScore(0, 2)).toBe(1);
        expect(tierScore(1, 2)).toBe(0);
        expect(tierScore(0, 1)).toBe(1);
    });

    it('puts a mean in the nearest tier, and one exactly halfway in the higher tier', () => {
        expect(nearestTier(1, 5)).toBe(0);
        expect(nearestTier(0, 5)).toBe(4);
        expect(nearestTier(0.8, 5)).toBe(1);
        expect(nearestTier(0.875, 5)).toBe(0); // halfway between S (1) and A (0.75)
        expect(nearestTier(0.625, 5)).toBe(1); // halfway between A and B
        expect(nearestTier((1 + 0 + 0.75) / 3, 5)).toBe(2);
        expect(nearestTier(0.4, 1)).toBe(0);
        // a third, which floating point can't hold exactly, still lands on the right side
        expect(nearestTier(1 / 3, 4)).toBe(2);
        expect(nearestTier(0.5, 2)).toBe(0);
    });

    it('turns score differences into tiers of the group list', () => {
        expect(inTiers(0.25, 5)).toBe(1);
        expect(inTiers(0.5, 3)).toBe(1);
        expect(inTiers(0.3, 1)).toBe(0.3);
    });

    it('folds names: case, accents and spacing don’t matter', () => {
        expect(foldName('  Café   Noir ')).toBe('cafe noir');
        expect(foldName('CAFÉ')).toBe(foldName('cafe'));
        expect(foldName('Ångström')).toBe('angstrom');
    });
});

describe('combining', () => {
    it('averages scores and places each item in the nearest group tier, best first', () => {
        const group = combineRankings([
            fruit('Fruit', { S: ['Mango', 'Pear'], A: ['Apple'], B: ['Kiwi'] }),
            fruit('Fruit', { S: ['Mango'], A: ['Kiwi', 'Pear'], B: ['Apple'] }),
            fruit('Fruit', { S: ['Mango', 'Apple'], A: [], B: ['Pear', 'Kiwi'] }),
        ]);
        expect(itemNamed(group, 'Mango')).toMatchObject({ mean: 1, spread: 0, votes: 3, tier: 0 });
        expect(itemNamed(group, 'Pear').mean).toBeCloseTo(0.5);
        // Apple and Pear tie on score and votes, so they're in name order
        expect(placements(group)).toEqual({ S: ['Mango'], A: ['Apple', 'Pear'], B: ['Kiwi'] });
        expect(itemNamed(group, 'Kiwi').mean).toBeCloseTo(1 / 6);
    });

    it('matches names whatever their case, accents or spacing, and names the item as the first list did', () => {
        const group = combineRankings([fruit('A', { S: ['Crème brûlée'], B: [] }), fruit('B', { S: [' CREME  BRULEE'], B: [] })]);
        expect(group.items).toHaveLength(1);
        expect(group.items[0]).toMatchObject({ name: 'Crème brûlée', votes: 2, mean: 1 });
    });

    it('counts items only some people ranked, with fewer votes', () => {
        const group = combineRankings([
            fruit('A', { S: ['Mango', 'Durian'], B: ['Pear'] }),
            fruit('B', { S: ['Mango'], B: ['Pear'] }),
            fruit('C', { S: ['Pear'], B: ['Mango'] }),
        ]);
        expect(itemNamed(group, 'Durian')).toMatchObject({ votes: 1, mean: 1, spread: 0, tier: 0 });
        expect(itemNamed(group, 'Mango')).toMatchObject({ votes: 3, tier: 0 });
        expect(placements(group)).toEqual({ S: ['Durian', 'Mango'], B: ['Pear'] });
    });

    it('orders equal scores by votes', () => {
        const group = combineRankings([fruit('A', { S: ['Lone', 'Shared'], B: [] }), fruit('B', { S: ['Shared'], B: [] })]);
        expect(placements(group).S).toEqual(['Shared', 'Lone']);
    });

    it('measures disagreement as the standard deviation of the scores', () => {
        const group = combineRankings([fruit('A', { S: ['Olive'], B: [] }), fruit('B', { S: [], B: ['Olive'] })]);
        expect(itemNamed(group, 'Olive')).toMatchObject({ mean: 0.5, spread: 0.5, tier: 0 });
        const three = combineRankings([
            fruit('A', { S: ['Fig'], A: [], B: [] }),
            fruit('B', { S: [], A: ['Fig'], B: [] }),
            fruit('C', { S: [], A: [], B: ['Fig'] }),
        ]);
        expect(itemNamed(three, 'Fig').spread).toBeCloseTo(Math.sqrt(1 / 6));
    });

    it('scores lists with different numbers of tiers on the same 0–1 scale, in the tiers most lists share', () => {
        const group = combineRankings([
            fruit('A', { Love: ['Mango'], Hate: ['Kiwi'] }),
            fruit('B', { S: ['Kiwi'], A: [], B: [], C: [], D: ['Mango'] }),
            fruit('C', { S: [], A: ['Mango'], B: [], C: [], D: ['Kiwi'] }),
        ]);
        expect(group.tiers.map((tier) => tier.label)).toEqual(['S', 'A', 'B', 'C', 'D']);
        expect(itemNamed(group, 'Mango').mean).toBeCloseTo((1 + 0 + 0.75) / 3);
        expect(placements(group)).toMatchObject({ B: ['Mango'], C: ['Kiwi'] });
    });

    it('uses the first list’s tiers when no two lists share theirs, and keeps its colours', () => {
        const group = combineRankings([fruit('A', { Top: ['Mango'], Low: [] }), fruit('B', { S: ['Mango'], A: [], B: [] })]);
        expect(group.tiers).toEqual([
            { label: 'Top', subtitle: '', color: COLOURS[0], textColor: '' },
            { label: 'Low', subtitle: '', color: COLOURS[1], textColor: '' },
        ]);
    });

    it('treats tier labels that differ only in case as the same tiers', () => {
        const group = combineRankings([
            fruit('A', { top: ['Mango'], low: [] }),
            fruit('B', { Best: ['Mango'], Worst: [] }),
            fruit('C', { TOP: ['Mango'], LOW: [] }),
        ]);
        expect(group.tiers.map((tier) => tier.label)).toEqual(['top', 'low']);
    });

    it('puts everything in a single tier when the group’s tiers are just one', () => {
        const group = combineRankings([fruit('A', { All: ['Mango', 'Kiwi'] }), fruit('B', { All: ['Kiwi'] })]);
        expect(group.tiers).toHaveLength(1);
        expect(placements(group)).toEqual({ All: ['Kiwi', 'Mango'] });
        expect(group.items.every((item) => item.mean === 1 && item.spread === 0)).toBe(true);
    });

    it('takes the title most lists share, else the first list’s', () => {
        expect(combineRankings([fruit('Fruit', { S: ['A'] }), fruit('Snacks', { S: ['A'] }), fruit('fruit', { S: ['A'] })]).title).toBe(
            'Fruit',
        );
        expect(combineRankings([fruit('', { S: ['A'] }), fruit('Snacks', { S: ['A'] })]).title).toBe('Snacks');
        expect(combineRankings([fruit('', { S: ['A'] }), fruit('', { S: ['A'] })]).title).toBe('');
    });

    it('says when there are too few or too many lists to combine', () => {
        expect(groupSizeProblem(1)).toBe('too few');
        expect(groupSizeProblem(2)).toBeNull();
        expect(groupSizeProblem(30)).toBeNull();
        expect(groupSizeProblem(31)).toBe('too many');
    });
});

describe('how close each person was', () => {
    it('measures each person’s mean distance from the group, only over items others ranked too', () => {
        const group = combineRankings([
            fruit('Sam', { S: ['Mango', 'Pear'], A: [], B: ['Kiwi'] }),
            fruit('Ola', { S: ['Mango'], A: ['Pear'], B: ['Kiwi'] }),
            fruit('Ren', { S: ['Kiwi', 'Solo'], A: [], B: ['Mango', 'Pear'] }),
        ]);
        const [sam, ola, ren] = group.people;
        expect(sam).toMatchObject({ ranked: 3, compared: 3 });
        expect(ren).toMatchObject({ ranked: 4, compared: 3 }); // Solo is Ren's alone
        expect(ola!.distance).toBeLessThan(sam!.distance!);
        expect(sam!.distance).toBeLessThan(ren!.distance!);
        expect(closestPerson(group.people)?.list).toBe(1);
    });

    it('has no distance for someone who shares nothing with the others, and no closest when nobody does', () => {
        const group = combineRankings([fruit('A', { S: ['Mango'] }), fruit('B', { S: ['Kiwi'] })]);
        expect(group.people.map((person) => person.distance)).toEqual([null, null]);
        expect(closestPerson(group.people)).toBeNull();
    });

    it('gives the first of equally close people', () => {
        const group = combineRankings([fruit('A', { S: ['Mango'], B: [] }), fruit('B', { S: [], B: ['Mango'] })]);
        expect(group.people.map((person) => person.distance)).toEqual([0.5, 0.5]);
        expect(closestPerson(group.people)?.list).toBe(0);
    });

    it('lists the most agreed and most disagreed items, leaving out ones only one person ranked', () => {
        const group = combineRankings([
            fruit('A', { S: ['Mango', 'Olive', 'Solo'], A: [], B: ['Kiwi'] }),
            fruit('B', { S: ['Mango'], A: ['Kiwi'], B: ['Olive'] }),
        ]);
        const names = (items: { name: string }[]) => items.map((item) => item.name);
        const { agreed, disagreed } = agreementExtremes(group.items, 5);
        // three shared items: two agreed on, and what's left, if people placed it differently
        expect(names(agreed)).toEqual(['Mango', 'Kiwi']);
        expect(names(disagreed)).toEqual(['Olive']);
        expect(names(agreementExtremes(group.items, 1).agreed)).toEqual(['Mango']);
        expect(names(agreementExtremes(group.items, 1).disagreed)).toEqual(['Olive']);
    });

    it('never puts an item in both lists, and leaves out of "disagreed" what everyone placed alike', () => {
        const many = combineRankings([
            fruit('A', { S: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], B: ['i', 'j', 'k', 'l'] }),
            fruit('B', { S: ['a', 'b', 'c', 'd', 'i', 'j'], B: ['e', 'f', 'g', 'h', 'k', 'l'] }),
        ]);
        const { agreed, disagreed } = agreementExtremes(many.items, 5);
        // a–d and k–l were placed alike (best first), e–j differently
        expect(agreed.map((item) => item.name)).toEqual(['a', 'b', 'c', 'd', 'k']);
        expect(disagreed.map((item) => item.name)).toEqual(['e', 'f', 'g', 'h', 'i']);
        const alike = combineRankings([fruit('A', { S: ['a', 'b'], B: [] }), fruit('B', { S: ['a', 'b'], B: [] })]);
        expect(agreementExtremes(alike.items, 5)).toEqual({ agreed: [alike.items[0]], disagreed: [] });
    });
});
