// src/core/group.ts  (tier-engine/core): group ranking
// ─────────────────────────────────────────────────────────────────────────────
//  Several people's rankings of the same things, combined into one list. Each
//  list's tiers become scores by position (top 1, bottom 0); an item's group
//  score is the mean of the scores of the people who ranked it, and it goes into
//  the group tier nearest that mean. Also how far apart people placed each item,
//  and how close each person was to the group. Reading a list into a RankedList
//  (which items are the same thing in two lists) is up to the app.
// ─────────────────────────────────────────────────────────────────────────────

/** How many lists can be combined: two make a group; past thirty nobody reads the table. */
export const GROUP_SIZE = { min: 2, max: 30 } as const;

/** One thing a person put in a tier. */
export interface RankedEntry {
    /** What makes it the same thing in someone else's list (the app decides: an id, a folded name…). */
    key: string;
    name: string;
    /** Where it was placed: the top tier is 1, the bottom tier 0 (tierScore). */
    score: number;
}

/** One person's list, reduced to what combining needs. */
export interface RankedList<Entry extends RankedEntry = RankedEntry, Tier extends { label: string } = { label: string }> {
    title: string;
    tiers: Tier[];
    /** Only what's in a tier: the pool doesn't count. Each key once. */
    items: Entry[];
}

/** One thing in the group's ranking. */
export interface GroupItem<Entry extends RankedEntry = RankedEntry> {
    key: string;
    name: string;
    /** Mean of its scores (0–1). */
    mean: number;
    /** How far apart people placed it: the standard deviation of its scores (0 = all the same tier, at most 0.5). */
    spread: number;
    /** How many people ranked it. */
    votes: number;
    /** Its tier in the group list (an index into GroupRanking.tiers). */
    tier: number;
    /** Each list's copy of it, in list order: the first names it. */
    copies: { list: number; item: Entry }[];
}

/** How one person's ranking compares with the group's. */
export interface PersonFit {
    /** Which list (index into the lists combined). */
    list: number;
    /** How many items they ranked. */
    ranked: number;
    /** How many of those someone else ranked too (the only ones a distance means anything for). */
    compared: number;
    /** Mean distance between their score and the group's for those items; null when there were none. */
    distance: number | null;
}

export interface GroupRanking<Entry extends RankedEntry = RankedEntry, Tier extends { label: string } = { label: string }> {
    /** The title most lists share (else the first list's); '' when none had one. */
    title: string;
    /** The tiers most lists share (by label, whatever the case), copied from the first list that has them. */
    tiers: Tier[];
    /** Every ranked item: by group tier, then score, then votes, then name. */
    items: GroupItem<Entry>[];
    people: PersonFit[];
}

/** "  Café  Noir " → "cafe noir": the same name whatever the case, accents or spacing. */
export const foldName = (name: string): string =>
    name
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/** The score of the tier at `index` of `tierCount`: evenly spaced from 1 (top) down to 0 (bottom); a lone tier is 1. */
export const tierScore = (index: number, tierCount: number): number => (tierCount > 1 ? 1 - index / (tierCount - 1) : 1);

/** A difference in scores, in tiers of a list with `tierCount` tiers (what people understand). */
export const inTiers = (scoreDifference: number, tierCount: number): number => scoreDifference * Math.max(1, tierCount - 1);

/** The group tier nearest a mean score: exactly halfway between two goes to the higher one. */
export function nearestTier(mean: number, tierCount: number): number {
    if (tierCount <= 1) return 0;
    const position = (1 - mean) * (tierCount - 1);
    // the small allowance keeps a mean that is halfway on paper but a hair off in floating point on the higher tier
    return Math.min(tierCount - 1, Math.max(0, Math.ceil(position - 0.5 - 1e-9)));
}

/** Whether this many lists can be combined at all, or why not. */
export function groupSizeProblem(count: number): 'too few' | 'too many' | null {
    if (count < GROUP_SIZE.min) return 'too few';
    if (count > GROUP_SIZE.max) return 'too many';
    return null;
}

/** The most common value (by `keyOf`) of `values`; a tie goes to the one that came first. */
function mostCommon<T>(values: readonly T[], keyOf: (value: T) => string): T | undefined {
    const counts = new Map<string, { value: T; count: number }>();
    for (const value of values) {
        const key = keyOf(value);
        const seen = counts.get(key);
        if (seen) seen.count++;
        else counts.set(key, { value, count: 1 });
    }
    let best: { value: T; count: number } | undefined;
    // Map keeps insertion order, so only a strictly bigger count replaces an earlier one
    for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
    return best?.value;
}

/** Combines the lists (check groupSizeProblem first). Tiers are copied, never shared with the lists. */
export function combineRankings<Entry extends RankedEntry, Tier extends { label: string }>(
    lists: readonly RankedList<Entry, Tier>[],
): GroupRanking<Entry, Tier> {
    const tierLook = mostCommon(lists, (list) => list.tiers.map((tier) => foldName(tier.label)).join('\n'))?.tiers ?? [];
    const tiers = tierLook.map((tier) => ({ ...tier }));
    const title = mostCommon(
        lists.filter((list) => list.title),
        (list) => foldName(list.title),
    )?.title;

    const byKey = new Map<string, { list: number; item: Entry }[]>();
    lists.forEach((list, index) => {
        for (const item of list.items) {
            const copies = byKey.get(item.key);
            if (copies) copies.push({ list: index, item });
            else byKey.set(item.key, [{ list: index, item }]);
        }
    });

    const items: GroupItem<Entry>[] = [...byKey].map(([key, copies]) => {
        const scores = copies.map((copy) => copy.item.score);
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        // the standard deviation: same units as the scores, and one person far off counts for more than many slightly off
        const spread = Math.sqrt(scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length);
        return { key, name: copies[0]!.item.name, mean, spread, votes: copies.length, tier: nearestTier(mean, tiers.length), copies };
    });
    items.sort((a, b) => a.tier - b.tier || b.mean - a.mean || b.votes - a.votes || a.name.localeCompare(b.name));

    const meanOf = new Map(items.map((item) => [item.key, item]));
    const people: PersonFit[] = lists.map((list, index) => {
        const shared = list.items.filter((item) => (meanOf.get(item.key)?.votes ?? 0) > 1);
        const total = shared.reduce((sum, item) => sum + Math.abs(item.score - meanOf.get(item.key)!.mean), 0);
        return { list: index, ranked: list.items.length, compared: shared.length, distance: shared.length ? total / shared.length : null };
    });

    return { title: title ?? '', tiers, items, people };
}

/** The person whose ranking was closest to the group's (the first of equals), or null if nobody could be compared. */
export function closestPerson(people: readonly PersonFit[]): PersonFit | null {
    let closest: PersonFit | null = null;
    for (const person of people)
        if (person.distance !== null && (closest === null || person.distance < closest.distance!)) closest = person;
    return closest;
}

/**
 * The items most agreed on (smallest spread first, then most votes) and most disagreed on
 * (largest spread first), at most `most` of each. Only items at least two people ranked count,
 * and no item is in both: with few items, the same ones heading both lists would say nothing.
 */
export function agreementExtremes<Item extends GroupItem<RankedEntry>>(
    items: readonly Item[],
    most: number,
): { agreed: Item[]; disagreed: Item[] } {
    const shared = items.filter((item) => item.votes > 1);
    const agreed = [...shared]
        .sort((a, b) => a.spread - b.spread || b.votes - a.votes || b.mean - a.mean)
        .slice(0, Math.min(most, Math.ceil(shared.length / 2)));
    const disagreed = shared
        .filter((item) => item.spread > 1e-9 && !agreed.includes(item))
        .sort((a, b) => b.spread - a.spread || b.votes - a.votes)
        .slice(0, most);
    return { agreed, disagreed };
}
