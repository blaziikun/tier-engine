// src/safe/index.ts  (tier-engine/safe)
// ─────────────────────────────────────────────────────────────────────────────
//  Safe HTML: the only way an app built on the engine, and the engine itself,
//  puts markup on the page.
//
//    setHtml(list, html`<b>${name}</b> has ${count} items`);
//
//  Every ${value} is escaped, so a name like  <img src=x onerror=alert(1)>  shows up
//  as text instead of running. Nested html`` results (and arrays of them) are
//  inserted as-is because they were escaped when they were built.
//
//  On browsers that support Trusted Types, the app's security policy also makes
//  any *other* way of assigning innerHTML throw, so a forgotten escape can't slip in.
//  The policy's name is the app's (useTrustedTypesPolicy), and its CSP must allow it.
// ─────────────────────────────────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text with &, <, >, " and ' turned into entities, safe inside an element or a quoted attribute. */
export const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** Markup that is known to be safe because it was built by html``. */
export class SafeHtml {
    constructor(readonly value: string) {}
    toString(): string {
        return this.value;
    }
}

/** Anything a template can hold. false, null and undefined render nothing (handy for `${on && html`…`}`). */
export type HtmlPart = SafeHtml | string | number | boolean | null | undefined | readonly HtmlPart[];

function render(part: HtmlPart): string {
    if (part == null || part === false || part === true) return '';
    if (part instanceof SafeHtml) return part.value;
    if (Array.isArray(part)) return part.map(render).join('');
    return escapeHtml(part);
}

/** Builds HTML; every interpolated value is escaped unless it is already SafeHtml. */
export function html(strings: TemplateStringsArray, ...parts: HtmlPart[]): SafeHtml {
    let out = strings[0]!;
    parts.forEach((part, i) => {
        out += render(part) + strings[i + 1]!;
    });
    return new SafeHtml(out);
}

/** Joins pieces of HTML with a separator (like Array.join, but stays safe). */
export const joinHtml = (parts: readonly HtmlPart[], separator: HtmlPart = ''): SafeHtml =>
    new SafeHtml(parts.map(render).join(render(separator)));

// ── putting it on the page ──
interface TrustedTypePolicy {
    createHTML(input: string): unknown;
}
interface TrustedTypesFactory {
    createPolicy(name: string, rules: { createHTML(s: string): string }): TrustedTypePolicy;
}

let policyName = 'tier-engine-html';
let policy: TrustedTypePolicy | null | undefined;

/**
 * Names the Trusted Types policy setHtml uses; the app's CSP lists it (`trusted-types <name>`). Call it once, before
 * anything is drawn; afterwards the policy exists and its name can't change.
 */
export function useTrustedTypesPolicy(name: string): void {
    if (policy !== undefined) throw new Error('tier-engine/safe: the Trusted Types policy is already in use');
    policyName = name;
}

function currentPolicy(): TrustedTypePolicy | null {
    if (policy === undefined)
        policy =
            (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes?.createPolicy(policyName, { createHTML: (s) => s }) ?? null;
    return policy;
}

/** Replaces an element's contents with safe HTML. */
export function setHtml(element: Element, content: SafeHtml): void {
    const policy = currentPolicy();
    element.innerHTML = (policy ? policy.createHTML(content.value) : content.value) as string;
}

/** A link address that can't run code: only http(s) and same-site links, everything else becomes "#". */
export function safeUrl(url: string): string {
    const text = String(url || '').trim();
    if (text.includes('\\')) return '#'; // browsers read "/\evil.example" as "//evil.example"
    if (/^https?:\/\//i.test(text) || /^\/(?!\/)/.test(text) || text.startsWith('#')) return text;
    return '#';
}
