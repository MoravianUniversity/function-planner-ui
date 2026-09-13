/**
 * Resolve a stable author id to a display label.
 * When no label is provided, the id itself is used (free-text / demo authors).
 * @param {{ authorLabels?: Record<string, string> }} options
 * @param {string} id
 * @returns {string}
 */
export function authorLabel(options, id) {
    const key = String(id ?? '').trim();
    if (!key) { return ''; }
    return options?.authorLabels?.[key] || key;
}

/**
 * Build displayName → id for names that map to exactly one id.
 * @param {Record<string, string>} labels id → display name
 * @returns {Map<string, string>}
 */
export function uniqueDisplayNameToId(labels) {
    const counts = new Map();
    const map = new Map();
    for (const [id, label] of Object.entries(labels || {})) {
        const name = String(label ?? '').trim();
        const stableId = String(id ?? '').trim();
        if (!name || !stableId) { continue; }
        counts.set(name, (counts.get(name) || 0) + 1);
        map.set(name, stableId);
    }
    for (const [name, count] of counts) {
        if (count > 1) { map.delete(name); }
    }
    return map;
}

/**
 * Filesystem-safe filename fragment from an author id or label.
 * If the value looks like an email, uses only the local-part (before @).
 * Hyphens and other non-word characters become '_'.
 * @param {string} idOrLabel
 * @returns {string}
 */
export function authorFilenameSuffix(idOrLabel) {
    let s = String(idOrLabel ?? '').trim();
    const at = s.indexOf('@');
    // Local-part@domain — drop the domain when it looks email-like.
    if (at > 0 && at < s.length - 1 && !s.includes(' ')) {
        s = s.slice(0, at);
    }
    // Replace non-word chars (including '-') with '_'; dots are kept.
    s = s.replace(/[^\w.]+/g, '_').replace(/^_+|_+$/g, '');
    return s || 'author';
}
