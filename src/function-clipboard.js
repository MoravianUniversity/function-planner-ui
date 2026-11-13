/**
 * Copy/paste for function nodes: structured JSON for in-app round-trip,
 * plain-text Python for external programs.
 */

import go from 'gojs';
import { pythonCodeToModel } from '@function-planner/shared';

import { functionNameMatchesPattern } from './inspector.js';
import { generatePythonFromFunctionJSON } from './save-load.js';
import { isMacOS } from './utils.js';

export const FUNCTION_CLIPBOARD_MIME = 'application/x-function-planner-function+json';
export const FUNCTION_CLIPBOARD_VERSION = 1;

/** @type {{ envelope: object, python: string } | null} */
let lastCopied = null;

const EPHEMERAL_FUNC_KEYS = [
    'key',
    'sequence',
    'problems',
    'linkProblems',
    'isTrusted',
    'readOnly',
    'isGroup',
    'group',
];

/**
 * True when the user is copying/pasting text in an editable field (or has a
 * non-collapsed DOM text selection), so we must not intercept.
 * @returns {boolean}
 */
export function isEditingText() {
    const el = document.activeElement;
    if (el) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            return true;
        }
        if (el.isContentEditable) {
            return true;
        }
    }
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed && String(sel).length > 0) {
        return true;
    }
    return false;
}

function isGlobalReadonly(options) {
    return Boolean(options.readonly) && !options.adminMode;
}

/**
 * @param {go.Diagram} diagram
 * @returns {go.Node | null}
 */
function selectedFunctionNode(diagram) {
    const part = diagram.selection.first();
    if (!(part instanceof go.Node) || part.data?.isGroup) {
        return null;
    }
    return part;
}

/**
 * Strip fields that should not travel with a clipboard payload.
 * @param {object} data
 * @returns {object}
 */
export function stripEphemeralFunctionFields(data) {
    const out = { ...data };
    for (const k of EPHEMERAL_FUNC_KEYS) {
        delete out[k];
    }
    return out;
}

/**
 * Drop code/testCode when the plan would not show them for this function name.
 * @param {object} data
 * @param {object} options
 * @returns {object}
 */
export function applyCodeVisibilityForClipboard(data, options={}) {
    const out = { ...data };
    if (options.adminMode) {
        return out;
    }
    const name = out.name?.toString() || '';
    if (!functionNameMatchesPattern(name, options.showCodeFor)) {
        delete out.code;
    }
    if (!functionNameMatchesPattern(name, options.showTestCodeFor)) {
        delete out.testCode;
    }
    return out;
}

/**
 * Drop owner when it is not in the target model's author list.
 * @param {object} data
 * @param {*} model
 * @returns {object}
 */
export function applyOwnerForPaste(data, model) {
    const out = { ...data };
    const owner = out.owner?.toString() || '';
    if (!owner) {
        delete out.owner;
        return out;
    }
    const authors = model.modelData.get('authors')?.toJSON() || [];
    if (!authors.includes(owner)) {
        delete out.owner;
    }
    return out;
}

/**
 * @param {*} model
 * @param {string} key
 * @returns {string[]}
 */
function calledNamesFor(model, key) {
    return (model.calledFunctions[key] || []).map(
        (toKey) => model.functions.get(toKey)?.get('name')?.toString() || `function${toKey}`
    );
}

/**
 * Build clipboard payload for a function key (visibility applied for the source plan).
 * @param {*} model
 * @param {string} key
 * @param {object} options
 * @returns {{ envelope: object, python: string } | null}
 */
export function buildFunctionClipboardPayload(model, key, options={}) {
    const ymap = model.functions.get(key);
    if (!ymap) {
        return null;
    }
    let funcData = stripEphemeralFunctionFields(ymap.toJSON());
    funcData = applyCodeVisibilityForClipboard(funcData, options);
    const envelope = { v: FUNCTION_CLIPBOARD_VERSION, function: funcData };
    const python = generatePythonFromFunctionJSON(funcData, options, {
        withTypes: true,
        showOwner: false,
        fallbackName: `function${key}`,
        calledNames: calledNamesFor(model, key),
    });
    return { envelope, python };
}

/**
 * Prepare function JSON for addFunc in the destination plan.
 * @param {object} funcData
 * @param {*} model
 * @param {object} options
 * @returns {object}
 */
export function prepareFunctionForPaste(funcData, model, options={}) {
    let data = stripEphemeralFunctionFields(funcData);
    data = applyCodeVisibilityForClipboard(data, options);
    data = applyOwnerForPaste(data, model);
    return data;
}

/**
 * @param {object} envelope
 * @returns {object | null}
 */
export function functionDataFromEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        return null;
    }
    if (envelope.v !== FUNCTION_CLIPBOARD_VERSION || !envelope.function || typeof envelope.function !== 'object') {
        return null;
    }
    return envelope.function;
}

/**
 * @param {string} text
 * @returns {object | null}
 */
function parseEnvelopeJson(text) {
    try {
        return functionDataFromEnvelope(JSON.parse(text));
    } catch {
        return null;
    }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikePythonFunction(text) {
    return /^\s*def\s+\w+/m.test(String(text || ''));
}

/**
 * Write payload onto a copy event or via the async clipboard API.
 * @param {{ envelope: object, python: string }} payload
 * @param {ClipboardEvent} [copyEvent]
 */
export function writeFunctionClipboard(payload, copyEvent=null) {
    lastCopied = payload;
    const json = JSON.stringify(payload.envelope);
    if (copyEvent?.clipboardData) {
        copyEvent.clipboardData.setData(FUNCTION_CLIPBOARD_MIME, json);
        copyEvent.clipboardData.setData('text/plain', payload.python);
        copyEvent.preventDefault();
        return;
    }
    void writeClipboardAsync(json, payload.python);
}

async function writeClipboardAsync(json, python) {
    try {
        if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
            const items = {
                'text/plain': new Blob([python], { type: 'text/plain' }),
            };
            // Chromium allows custom MIME types with a web prefix for unsanctioned types.
            try {
                items[FUNCTION_CLIPBOARD_MIME] = new Blob([json], { type: FUNCTION_CLIPBOARD_MIME });
                await navigator.clipboard.write([new ClipboardItem(items)]);
                return;
            } catch {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/plain': new Blob([python], { type: 'text/plain' }),
                })]);
                return;
            }
        }
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(python);
            return;
        }
    } catch {
        // fall through
    }
    const textArea = document.createElement('textarea');
    textArea.value = python;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand?.('copy');
    } catch {
        // ignore (e.g. jsdom)
    } finally {
        document.body.removeChild(textArea);
    }
}

/**
 * Resolve function JSON from a paste event, in-memory cache, or Python text.
 * @param {DataTransfer | null} clipboardData
 * @returns {Promise<object[]>} zero or more function objects to paste
 */
export async function readFunctionsFromClipboard(clipboardData=null) {
    const mimeText = clipboardData?.getData(FUNCTION_CLIPBOARD_MIME) || '';
    const fromMime = parseEnvelopeJson(mimeText);
    if (fromMime) {
        return [fromMime];
    }

    let plain = clipboardData?.getData('text/plain') || '';
    if (!plain && navigator.clipboard?.readText) {
        try {
            plain = await navigator.clipboard.readText();
        } catch {
            plain = '';
        }
    }

    // Same-tab fallback when custom MIME was stripped but plain matches (or is empty).
    if (lastCopied?.envelope && (!plain || plain === lastCopied.python)) {
        const fromMem = functionDataFromEnvelope(lastCopied.envelope);
        if (fromMem) {
            return [fromMem];
        }
    }

    if (looksLikePythonFunction(plain)) {
        try {
            const parsed = pythonCodeToModel(plain);
            return (parsed.functions || []).map((f) => {
                const { key, ...rest } = f;
                return rest;
            });
        } catch {
            return [];
        }
    }

    return [];
}

/**
 * Copy the selected function node, if any.
 * @param {go.Diagram} diagram
 * @param {*} model
 * @param {object} options
 * @param {ClipboardEvent} [copyEvent]
 * @returns {boolean} true if a function was copied
 */
export function copySelectedFunction(diagram, model, options={}, copyEvent=null) {
    if (isEditingText()) {
        return false;
    }
    const node = selectedFunctionNode(diagram);
    if (!node) {
        return false;
    }
    const payload = buildFunctionClipboardPayload(model, String(node.data.key), options);
    if (!payload) {
        return false;
    }
    writeFunctionClipboard(payload, copyEvent);
    return true;
}

/**
 * Paste function(s) into the model.
 * @param {*} model
 * @param {object} options
 * @param {DataTransfer | null} [clipboardData]
 * @returns {Promise<boolean>} true if at least one function was added
 */
export async function pasteFunctions(model, options={}, clipboardData=null) {
    if (isGlobalReadonly(options)) {
        return false;
    }
    if (isEditingText()) {
        return false;
    }
    const funcs = await readFunctionsFromClipboard(clipboardData);
    if (funcs.length === 0) {
        return false;
    }
    for (const func of funcs) {
        model.addFunc(prepareFunctionForPaste(func, model, options));
    }
    return true;
}

/**
 * Clear the in-memory clipboard cache (tests).
 */
export function clearFunctionClipboardCache() {
    lastCopied = null;
}

/**
 * @returns {{ envelope: object, python: string } | null}
 */
export function getFunctionClipboardCache() {
    return lastCopied;
}

function makeContextMenu(diagram, model, options, rootElem) {
    const menu = document.createElement('div');
    menu.className = 'func-planner-context-menu';
    menu.style.display = 'none';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'func-planner-context-menu-item';

    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.textContent = 'Paste';
    pasteBtn.className = 'func-planner-context-menu-item';

    menu.append(copyBtn, pasteBtn);
    rootElem.appendChild(menu);

    let currentNode = null;

    copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentNode) {
            diagram.select(currentNode);
            copySelectedFunction(diagram, model, options);
        }
        diagram.toolManager.contextMenuTool.stopTool();
    });

    pasteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void pasteFunctions(model, options).then(() => {
            diagram.toolManager.contextMenuTool.stopTool();
        });
    });

    return new go.HTMLInfo({
        mainElement: menu,
        show: (obj, diag, _tool) => {
            currentNode = obj?.part instanceof go.Node && !obj.part.data?.isGroup ? obj.part : null;
            copyBtn.disabled = !currentNode;
            pasteBtn.disabled = isGlobalReadonly(options);
            pasteBtn.style.display = isGlobalReadonly(options) ? 'none' : '';

            const mouse = diag.lastInput.viewPoint;
            menu.style.display = 'flex';
            menu.style.left = `${mouse.x}px`;
            menu.style.top = `${mouse.y}px`;
            return menu;
        },
        hide: () => {
            menu.style.display = 'none';
            currentNode = null;
        },
    });
}

/**
 * Install copy/paste listeners and a node context menu.
 * @param {go.Diagram} diagram
 * @param {*} model
 * @param {object} options
 * @param {HTMLElement} [rootElem]
 */
export function setupFunctionClipboard(diagram, model, options={}, rootElem=null) {
    const root = rootElem || diagram.div?.parentElement || document.body;
    const isMac = isMacOS();

    diagram.nodeTemplate.contextMenu = makeContextMenu(diagram, model, options, root);

    const onCopy = (e) => {
        if (isEditingText()) {
            return;
        }
        if (!selectedFunctionNode(diagram)) {
            return;
        }
        copySelectedFunction(diagram, model, options, e);
    };

    const onPaste = (e) => {
        if (isEditingText() || isGlobalReadonly(options)) {
            return;
        }
        // Always try; if clipboard has no function payload, leave browser default alone.
        const data = e.clipboardData;
        // Peek synchronously for our MIME or lastCopied matching plain text.
        const mime = data?.getData(FUNCTION_CLIPBOARD_MIME) || '';
        const plain = data?.getData('text/plain') || '';
        const hasMime = Boolean(parseEnvelopeJson(mime));
        const hasMem = Boolean(lastCopied?.envelope) && (!plain || plain === lastCopied.python);
        const hasPy = looksLikePythonFunction(plain);
        if (!hasMime && !hasMem && !hasPy) {
            return;
        }
        e.preventDefault();
        void pasteFunctions(model, options, data);
    };

    const onKeyDown = (e) => {
        if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) {
            return;
        }
        // Cmd/Ctrl+C: write ourselves (GoJS / empty selection may not fire a useful copy).
        // Paste is handled by the paste event so we do not double-insert.
        if (e.key.toLowerCase() !== 'c') {
            return;
        }
        if (isEditingText() || !selectedFunctionNode(diagram)) {
            return;
        }
        e.preventDefault();
        copySelectedFunction(diagram, model, options);
    };

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
        document.removeEventListener('copy', onCopy, true);
        document.removeEventListener('paste', onPaste, true);
        document.removeEventListener('keydown', onKeyDown, true);
    };
}
