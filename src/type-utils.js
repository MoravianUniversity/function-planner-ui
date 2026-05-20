/**
 * Shared utilities for converting between Python type annotations and
 * the planner's English-like display text.
 */

const BASE_TYPES = new Set(['int', 'float', 'str', 'bool']);
const CONTAINER_TYPES = new Set(['list', 'tuple', 'set', 'dict']);

function normalizeString(text) {
    return (text || '').toString().trim().replace(/\s+/g, ' ');
}

function parsePythonType(typeStr) {
    const src = normalizeString(typeStr);
    if (!src || src === '?') { return { type: '' }; }

    const parseAt = (start = 0) => {
        let i = start;
        while (i < src.length && /\s/.test(src[i])) i++;

        const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        if (!nameMatch) {
            throw new Error('Expected type name');
        }
        const rawName = nameMatch[0];
        const name = rawName.toLowerCase();
        i += rawName.length;

        while (i < src.length && /\s/.test(src[i])) i++;

        // Bare names
        if (src[i] !== '[') {
            if (BASE_TYPES.has(name)) { return [{ type: name }, i]; }
            if (CONTAINER_TYPES.has(name)) {
                if (name === 'dict') return [{ type: 'dict', keyType: { type: '' }, valueType: { type: '' } }, i];
                if (name === 'tuple') return [{ type: 'tuple', mode: 'with', types: [{ type: '' }, { type: '' }] }, i];
                return [{ type: name, mode: 'of', nested: { type: '' } }, i];
            }
            return [{ type: 'custom', customValue: rawName }, i];
        }

        // Generic form: Name[...]
        i++; // skip '['
        const args = [];
        while (true) {
            while (i < src.length && /\s/.test(src[i])) i++;

            if (src.slice(i, i + 3) === '...') {
                args.push({ type: 'ellipsis' });
                i += 3;
            } else {
                const [arg, next] = parseAt(i);
                args.push(arg);
                i = next;
            }

            while (i < src.length && /\s/.test(src[i])) i++;
            if (src[i] === ',') { i++; continue; }
            if (src[i] === ']') { i++; break; }
            throw new Error('Expected , or ]');
        }

        if (name === 'list') {
            return [args.length <= 1
                ? { type: 'list', mode: 'of', nested: args[0] || { type: '' } }
                : { type: 'list', mode: 'with', types: args }, i];
        }
        if (name === 'set') {
            return [{ type: 'set', mode: 'of', nested: args[0] || { type: '' } }, i];
        }
        if (name === 'dict') {
            return [{
                type: 'dict',
                keyType: args[0] || { type: '' },
                valueType: args[1] || { type: '' },
            }, i];
        }
        if (name === 'tuple') {
            if (args.length === 2 && args[1]?.type === 'ellipsis') {
                return [{ type: 'tuple', mode: 'of', nested: args[0] || { type: '' } }, i];
            }
            return [{ type: 'tuple', mode: 'with', types: args.length ? args : [{ type: '' }, { type: '' }] }, i];
        }

        // Unknown generic -> custom raw fallback
        return [{ type: 'custom', customValue: `${rawName}[${args.map(astToPython).join(', ')}]` }, i];
    };

    const [parsed, end] = parseAt(0);
    if (normalizeString(src.slice(end)) !== '') {
        throw new Error('Unexpected trailing tokens');
    }
    return parsed;
}

function needsParensInEnglish(ast) {
    return ['list', 'tuple', 'set', 'dict'].includes(ast?.type);
}

function astToEnglish(ast) {
    if (!ast || !ast.type) { return '?'; }
    if (ast.type === 'custom') { return ast.customValue || '?'; }
    if (BASE_TYPES.has(ast.type)) { return ast.type; }

    if (ast.type === 'list') {
        if (ast.mode === 'with') {
            return `list with ${joinEnglish((ast.types || []).map(astToEnglish))}`;
        }
        const nested = astToEnglish(ast.nested);
        return `list of ${needsParensInEnglish(ast.nested) ? `(${nested})` : nested}`;
    }
    if (ast.type === 'set') {
        const nested = astToEnglish(ast.nested);
        return `set of ${needsParensInEnglish(ast.nested) ? `(${nested})` : nested}`;
    }
    if (ast.type === 'tuple') {
        if (ast.mode === 'of') {
            const nested = astToEnglish(ast.nested);
            return `tuple of ${needsParensInEnglish(ast.nested) ? `(${nested})` : nested}`;
        }
        return `tuple with ${joinEnglish((ast.types || []).map(astToEnglish))}`;
    }
    if (ast.type === 'dict') {
        const key = astToEnglish(ast.keyType);
        const value = astToEnglish(ast.valueType);
        return `dict with keys of ${needsParensInEnglish(ast.keyType) ? `(${key})` : key} associated with values of ${needsParensInEnglish(ast.valueType) ? `(${value})` : value}`;
    }
    return ast.type;
}

function joinEnglish(items) {
    if (items.length <= 1) { return items[0] || '?'; }
    if (items.length === 2) { return `${items[0]} and ${items[1]}`; }
    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

export function toEnglishType(typeStr) {
    const src = normalizeString(typeStr);
    if (!src) { return ''; }
    if (src === '?') { return '?'; }
    return astToEnglish(parsePythonType(src));
}
