import go from 'gojs';

/** Dot diameter — slightly under bottom avatars, large enough for color. */
const EDITOR_DOT_SIZE = 11;
/**
 * Pull each subsequent dot left so they overlap. Applied as left margin only so the
 * last circle is not clipped on the right.
 */
const EDITOR_DOT_OVERLAP = -3;

/** Adornment category — does not affect node layout bounds. */
const EDITORS_ADORNMENT = 'Editors';

/** Draw above the default selection adornment. */
const EDITORS_Z_ORDER = 100;

const DEFAULT_GROUP_DOT_COLORS = ['#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#f781bf'];

/**
 * Solid fill for an author group index (1-based).
 * Matches `--group-N-color` hues without the translucent alpha used for claim groups.
 * @param {number} groupIndex1Based
 * @returns {string}
 */
function groupDotFill(groupIndex1Based) {
    if (!groupIndex1Based || groupIndex1Based < 1) {
        return '#9ca3af';
    }
    return DEFAULT_GROUP_DOT_COLORS[(groupIndex1Based - 1) % DEFAULT_GROUP_DOT_COLORS.length];
}

/**
 * Resolve a GoJS theme color name or CSS color to a paintable string.
 * @param {go.Diagram} diagram
 * @param {string} nameOrColor
 * @returns {string}
 */
function resolveThemeColor(diagram, nameOrColor) {
    if (!nameOrColor || nameOrColor === 'none') {
        return '#111827';
    }
    if (/^(#|rgb|hsl)/i.test(nameOrColor)) {
        return nameOrColor;
    }
    try {
        const tm = diagram.themeManager;
        const themeName = tm.currentTheme || tm.defaultTheme;
        const theme = typeof tm.findTheme === 'function' ? tm.findTheme(themeName) : null;
        const fromTheme = theme?.colors?.[nameOrColor];
        if (typeof fromTheme === 'string' && fromTheme) {
            return fromTheme;
        }
    } catch (_) {
        // fall through to CSS
    }
    const root = diagram.div?.closest?.('.func-planner') || diagram.div;
    if (!root) {
        return '#111827';
    }
    const cssKey =
        nameOrColor === 'error-stroke'
            ? '--error-stroke-color'
            : nameOrColor === 'warning-stroke'
              ? '--warning-stroke-color'
              : `--${nameOrColor}-color`;
    return getComputedStyle(root).getPropertyValue(cssKey).trim() || '#111827';
}

/**
 * @param {string} color
 * @param {number} alpha
 * @returns {string}
 */
function withAlpha(color, alpha) {
    if (!(alpha < 1)) {
        return color;
    }
    const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (hex) {
        const n = parseInt(hex[1], 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
    if (rgb) {
        return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
    }
    return color;
}

/**
 * Stroke matching the function box outline (same theme stroke + shape opacity).
 * @param {go.Diagram} diagram
 * @param {go.Node} node
 * @returns {string}
 */
function nodeBorderStroke(diagram, node) {
    const shape = node.findObject('SHAPE');
    const problems = (node.data?.problems || []).concat(node.data?.linkProblems || []);
    let themeKey = 'stroke';
    if (problems.some((p) => p[0] === 'error')) {
        themeKey = 'error-stroke';
    } else if (problems.length > 0) {
        themeKey = 'warning-stroke';
    }

    // Prefer the live themed stroke on SHAPE when it is already a CSS color;
    // otherwise resolve the same theme key the node template uses.
    const live = shape?.stroke;
    let color;
    if (typeof live === 'string' && /^(#|rgb|hsl)/i.test(live)) {
        color = live;
    } else if (typeof live === 'string' && live && live !== 'none') {
        color = resolveThemeColor(diagram, live);
    } else {
        color = resolveThemeColor(diagram, themeKey);
    }

    // Node SHAPE uses opacity 0.6 — match so the ring reads as the box border, not body text.
    const opacity = typeof shape?.opacity === 'number' ? shape.opacity : 0.6;
    return withAlpha(color, opacity);
}

/**
 * @param {string[]} names
 * @returns {go.Adornment}
 */
function editorsToolTip(names) {
    return new go.Adornment('Auto').add(
        new go.Shape('RoundedRectangle', {
            fill: 'rgba(17, 24, 39, 0.92)',
            stroke: null,
            parameter1: 4,
        }),
        new go.TextBlock(names.join(', '), {
            margin: new go.Margin(4, 6),
            stroke: 'white',
            font: "12px system-ui, sans-serif",
        }),
    );
}

/**
 * Presence dots as an Adornment on BODY: straddles the top edge (left-aligned),
 * without expanding node layout bounds.
 * @param {go.Diagram} diagram
 * @param {go.Node} node
 * @param {{ authorId: string, name: string, color: string }[]} items
 * @returns {go.Adornment}
 */
function makeEditorsAdornment(diagram, node, items) {
    const stroke = nodeBorderStroke(diagram, node);

    const dots = new go.Panel('Horizontal', {
        // Left-aligned; center on the top edge, nudged 1px down for a true straddle.
        alignment: new go.Spot(0, 0, 4, 1),
        alignmentFocus: new go.Spot(0, 0.5, 0, 0),
        cursor: 'default',
        isActionable: false,
        toolTip: editorsToolTip(items.map((i) => i.name)),
    });

    items.forEach((item, i) => {
        dots.add(
            new go.Shape('Circle', {
                width: EDITOR_DOT_SIZE,
                height: EDITOR_DOT_SIZE,
                fill: item.color,
                stroke,
                strokeWidth: 1.5,
                margin: i > 0 ? new go.Margin(0, 0, 0, EDITOR_DOT_OVERLAP) : new go.Margin(0),
            }),
        );
    });

    return new go.Adornment('Spot', {
        layerName: diagram.findLayer('Editors') ? 'Editors' : 'Adornment',
        zOrder: EDITORS_Z_ORDER,
        isInDocumentBounds: false,
    }).add(
        new go.Placeholder({ isActionable: false }),
        dots,
    );
}

/** Mini-dot size in the inspector (smaller than graph dots). */
const FIELD_DOT_SIZE = 8;
const FIELD_DOT_OVERLAP = -2;
const FIELD_EDITORS_CLASS = 'field-editors';

/**
 * Resolve which field path a focused control maps to (problem-checker style).
 * @param {EventTarget|null} target
 * @returns {string|null}
 */
export function resolveEditingFieldId(target) {
    if (!(target instanceof Element)) {
        return null;
    }
    const control = target.closest(
        'input, textarea, select, button.func-var-type-edit',
    );
    if (!control || control.closest('.field-editors')) {
        return null;
    }

    // Parameter / return facets: params[0].name
    const varFacet = [...control.classList].find((c) => c.startsWith('func-var-'));
    if (varFacet) {
        const facet = varFacet.slice('func-var-'.length); // name | type | desc
        if (facet === 'type-edit' || facet === 'type-holder' || facet === 'insert' || facet === 'drag-handle') {
            // type-edit button → treat as type
            if (facet === 'type-edit' || control.classList.contains('func-var-type-edit')) {
                const box = control.closest('.func-var');
                const list = box?.parentElement;
                const vars = control.closest('.func-params, .func-returns');
                if (!box || !list || !vars) {
                    return null;
                }
                const index = Array.prototype.indexOf.call(list.children, box);
                const base = vars.classList.contains('func-params') ? 'params' : 'returns';
                return `${base}[${index}].type`;
            }
            return null;
        }
        if (facet !== 'name' && facet !== 'type' && facet !== 'desc') {
            return null;
        }
        const box = control.closest('.func-var');
        const list = box?.parentElement;
        const vars = control.closest('.func-params, .func-returns');
        if (!box || !list || !vars) {
            return null;
        }
        const index = Array.prototype.indexOf.call(list.children, box);
        if (index < 0) {
            return null;
        }
        const base = vars.classList.contains('func-params') ? 'params' : 'returns';
        return `${base}[${index}].${facet}`;
    }

    // Author rows (module)
    if (control.closest('.func-authors')) {
        return 'authors';
    }

    // Top-level func-* controls (name, desc, io, code, documentation, …)
    for (const clazz of control.classList) {
        if (!clazz.startsWith('func-')) {
            continue;
        }
        const rest = clazz.slice('func-'.length);
        if (
            !rest ||
            rest === 'var' ||
            rest.startsWith('var-') ||
            rest === 'button' ||
            rest.startsWith('button-') ||
            rest === 'vars' ||
            rest.startsWith('vars-') ||
            rest === 'code-box' ||
            rest === 'authors' ||
            rest.startsWith('authors-') ||
            rest === 'author-row' ||
            rest === 'planner'
        ) {
            continue;
        }
        return rest;
    }
    return null;
}

/**
 * Find the DOM control for a field path inside an inspector root.
 * @param {HTMLElement} root
 * @param {string} fieldId
 * @returns {Element|null}
 */
function findFieldControl(root, fieldId) {
    if (!root || !fieldId) {
        return null;
    }
    if (fieldId.includes('[')) {
        const [baseField, rem] = fieldId.split('[');
        const [indexStr, name_] = rem.split(']');
        const facet = name_.startsWith('.') ? name_.slice(1) : name_;
        const index = Number(indexStr);
        const list = root.getElementsByClassName(`func-${baseField}`)[0]
            ?.querySelector('.func-vars-list');
        const box = list?.children?.[index];
        return box?.getElementsByClassName(`func-var-${facet}`)?.[0] ?? null;
    }
    if (fieldId === 'authors') {
        return root.querySelector('.func-authors') ?? null;
    }
    return root.getElementsByClassName(`func-${fieldId}`)[0] ?? null;
}

/**
 * Host + anchor for a mini-dot strip. Always overlay (absolute) so layout never shifts.
 * @param {Element} control
 * @returns {{ host: HTMLElement, anchor: HTMLElement }|null}
 */
function findFieldHost(control) {
    if (!(control instanceof HTMLElement)) {
        return null;
    }
    if (control.classList.contains('func-authors') || control.closest('.func-authors')) {
        const host = control.closest('.func-authors') || control;
        const anchor = control.matches('input') ? control : (host.querySelector('input') || host);
        return { host, anchor };
    }
    if (control.classList.contains('func-name') || control.matches('input.func-name')) {
        const host = control.closest('h2') || control.parentElement || control;
        return { host, anchor: control };
    }
    const codeBox = control.closest('.func-code-box');
    if (codeBox) {
        // Anchor to the editable control; host is the code box for positioning room.
        const anchor = codeBox.querySelector('textarea, input') || control;
        return { host: codeBox, anchor };
    }
    if (control.matches('.func-var-name, .func-var-type, .func-var-desc')) {
        const box = control.closest('.func-var');
        return { host: box || control.parentElement || control, anchor: control };
    }
    const label = control.closest('label');
    if (label && label.contains(control)) {
        return { host: label, anchor: control };
    }
    // Bare textarea/input (e.g. func-desc): wrap so we have a positioning context.
    if (control.matches('input, textarea, select')) {
        let wrap = control.parentElement;
        if (!wrap?.classList.contains('field-editors-wrap')) {
            wrap = document.createElement('span');
            wrap.className = 'field-editors-wrap';
            control.replaceWith(wrap);
            wrap.appendChild(control);
        }
        return { host: wrap, anchor: control };
    }
    return { host: control, anchor: control };
}

/**
 * Place strip so the first dot straddles the anchor's top-right corner (no layout impact).
 * @param {HTMLElement} host
 * @param {HTMLElement} anchor
 * @param {HTMLElement} strip
 */
function positionFieldEditorsStrip(host, anchor, strip) {
    const hostRect = host.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    // Compact labeled controls (I/O select, Testable checkbox) sit flush at 50%;
    // other inputs need a slight inward nudge.
    const edgeRatio = anchor.matches('.func-io, .func-testable, input[type="checkbox"]')
        ? 0.5
        : 0.7;
    strip.style.left = `${anchorRect.right - hostRect.left - FIELD_DOT_SIZE * edgeRatio}px`;
    strip.style.top = `${anchorRect.top - hostRect.top - FIELD_DOT_SIZE / 2}px`;
}

/**
 * @param {{ name: string, color: string }[]} items
 * @returns {HTMLElement}
 */
function makeFieldEditorsStrip(items) {
    const strip = document.createElement('span');
    strip.className = FIELD_EDITORS_CLASS;
    strip.setAttribute('aria-hidden', 'true');
    strip.title = items.map((i) => i.name).join(', ');
    items.forEach((item, i) => {
        const dot = document.createElement('span');
        dot.className = 'field-editor-dot';
        dot.style.width = `${FIELD_DOT_SIZE}px`;
        dot.style.height = `${FIELD_DOT_SIZE}px`;
        dot.style.backgroundColor = item.color;
        if (i > 0) {
            dot.style.marginLeft = `${FIELD_DOT_OVERLAP}px`;
        }
        strip.appendChild(dot);
    });
    return strip;
}

/**
 * Wire Yjs awareness ↔ function-box editor dots and inspector field mini-dots.
 * @param {go.Diagram} diagram
 * @param {object} options
 * @param {import('y-protocols/awareness').Awareness} [options.awareness]
 * @param {string[]|null} [options.externalAuthors]
 * @returns {{
 *   publishEditingKey: (key: string|null) => void,
 *   publishEditingField: (fieldId: string|null) => void,
 *   attachInspector: (inspectorDiv: HTMLElement) => void,
 *   refreshEditors: () => void,
 *   refreshFieldEditors: () => void,
 *   destroy: () => void,
 * }}
 */
export function setupEditingPresence(diagram, options) {
    const awareness = options.awareness;
    const noop = {
        publishEditingKey() {},
        publishEditingField() {},
        attachInspector() {},
        refreshEditors() {},
        refreshFieldEditors() {},
        destroy() {},
    };
    if (!awareness) {
        return noop;
    }

    /** @type {string|null} Function key currently shown in the inspector (null = module). */
    let viewingFuncKey = null;
    /** @type {HTMLElement|null} */
    let inspectorRoot = null;
    /** @type {MutationObserver|null} */
    let inspectorObserver = null;
    let fieldRefreshScheduled = false;

    // Keep editor dots above the built-in selection adornment layer.
    // Must stay out of document bounds: Unconnected nodes are viewport-aligned, and an
    // in-bounds adornment on them expands documentBounds and shoves the digraph away.
    if (!diagram.findLayer('Editors')) {
        const adornLayer = diagram.findLayer('Adornment');
        if (adornLayer) {
            diagram.addLayerAfter(new go.Layer({
                name: 'Editors',
                isTemporary: true,
                isInDocumentBounds: false,
            }), adornLayer);
        }
    }

    function canPublish() {
        const local = awareness.getLocalState();
        return Boolean(local && (local.authorId || local.userId || local.name));
    }

    function editorEntryFromState(state) {
        const authors = Array.isArray(options.externalAuthors) ? options.externalAuthors : [];
        const maxGroup = diagram.themeManager.maxGroup || 5;
        const authorId = typeof state.authorId === 'string' ? state.authorId.trim() : '';
        const name =
            (typeof state.name === 'string' && state.name.trim()) ||
            authorId ||
            '';
        if (!authorId && !name && !state.userId) {
            return null;
        }
        const idx = authorId ? authors.indexOf(authorId) : -1;
        const group = idx >= 0 ? (idx % maxGroup) + 1 : 0;
        return {
            authorId,
            name: name || 'Someone',
            color: groupDotFill(group),
        };
    }

    /**
     * @returns {Map<string, { authorId: string, name: string, color: string }[]>}
     */
    function buildEditorsByKey() {
        /** @type {Map<string, { authorId: string, name: string, color: string }[]>} */
        const byKey = new Map();

        awareness.getStates().forEach((state, clientId) => {
            // Don't show your own presence dot on the graph.
            if (clientId === awareness.clientID) {
                return;
            }
            const key = state?.editingFuncKey;
            if (key == null || key === '') {
                return;
            }
            const entry = editorEntryFromState(state);
            if (!entry) {
                return;
            }
            const list = byKey.get(String(key)) ?? [];
            list.push(entry);
            byKey.set(String(key), list);
        });
        return byKey;
    }

    /**
     * Remotes editing fields on the currently viewed function/module.
     * @returns {Map<string, { authorId: string, name: string, color: string }[]>}
     */
    function buildFieldEditorsById() {
        /** @type {Map<string, { authorId: string, name: string, color: string }[]>} */
        const byField = new Map();
        awareness.getStates().forEach((state, clientId) => {
            if (clientId === awareness.clientID) {
                return;
            }
            const remoteKey = state?.editingFuncKey == null || state.editingFuncKey === ''
                ? null
                : String(state.editingFuncKey);
            if (remoteKey !== viewingFuncKey) {
                return;
            }
            const fieldId = typeof state.editingFieldId === 'string' ? state.editingFieldId.trim() : '';
            if (!fieldId) {
                return;
            }
            const entry = editorEntryFromState(state);
            if (!entry) {
                return;
            }
            const list = byField.get(fieldId) ?? [];
            list.push(entry);
            byField.set(fieldId, list);
        });
        return byField;
    }

    /** Skip MutationObserver while we mutate strips ourselves. */
    let fieldEditorsMutating = false;

    function clearFieldEditorStrips() {
        if (!inspectorRoot) {
            return;
        }
        for (const el of Array.from(inspectorRoot.querySelectorAll(`.${FIELD_EDITORS_CLASS}`))) {
            el.remove();
        }
    }

    function refreshFieldEditors() {
        if (!inspectorRoot) {
            return;
        }
        fieldEditorsMutating = true;
        inspectorObserver?.disconnect();
        try {
            clearFieldEditorStrips();
            const byField = buildFieldEditorsById();
            byField.forEach((items, fieldId) => {
                if (!items.length) {
                    return;
                }
                const control = findFieldControl(inspectorRoot, fieldId);
                const placed = control ? findFieldHost(control) : null;
                if (!placed) {
                    return;
                }
                const { host, anchor } = placed;
                host.classList.add('field-editors-host');
                const strip = makeFieldEditorsStrip(items);
                strip.classList.add('field-editors--overlay');
                host.appendChild(strip);
                positionFieldEditorsStrip(host, anchor, strip);
            });
        } finally {
            fieldEditorsMutating = false;
            if (inspectorRoot && inspectorObserver) {
                inspectorObserver.observe(inspectorRoot, { childList: true, subtree: true });
            }
        }
    }

    function scheduleFieldRefresh() {
        if (fieldRefreshScheduled || fieldEditorsMutating) {
            return;
        }
        fieldRefreshScheduled = true;
        requestAnimationFrame(() => {
            fieldRefreshScheduled = false;
            refreshFieldEditors();
        });
    }

    function refreshEditors() {
        const byKey = buildEditorsByKey();
        diagram.nodes.each((node) => {
            if (!(node instanceof go.Node) || node.data?.isGroup) {
                return;
            }
            node.removeAdornment(EDITORS_ADORNMENT);
            const items = byKey.get(String(node.data.key)) ?? [];
            if (items.length === 0) {
                return;
            }
            const adorned = node.findObject('BODY') || node;
            const adornment = makeEditorsAdornment(diagram, node, items);
            adornment.adornedObject = adorned;
            node.addAdornment(EDITORS_ADORNMENT, adornment);
        });
        scheduleFieldRefresh();
    }

    /** Re-apply after selection adornments so editor dots stay on top. */
    function refreshEditorsAfterSelection() {
        // Selection adornment is added in the same turn; wait two frames so we stack after it.
        requestAnimationFrame(() => {
            requestAnimationFrame(refreshEditors);
        });
    }

    /**
     * @param {string|null} key
     */
    function publishEditingKey(key) {
        const next = key == null || key === '' ? null : key;
        viewingFuncKey = next;
        scheduleFieldRefresh();
        if (!canPublish()) {
            return;
        }
        awareness.setLocalStateField('editingFuncKey', next);
        // Selection change leaves the previous field.
        awareness.setLocalStateField('editingFieldId', null);
    }

    /**
     * @param {string|null} fieldId
     */
    function publishEditingField(fieldId) {
        if (!canPublish()) {
            return;
        }
        awareness.setLocalStateField(
            'editingFieldId',
            fieldId == null || fieldId === '' ? null : fieldId,
        );
    }

    /**
     * @param {FocusEvent} e
     */
    function onInspectorFocusIn(e) {
        const fieldId = resolveEditingFieldId(e.target);
        publishEditingField(fieldId);
    }

    /**
     * @param {FocusEvent} e
     */
    function onInspectorFocusOut(_e) {
        requestAnimationFrame(() => {
            if (!inspectorRoot) {
                return;
            }
            if (!inspectorRoot.contains(document.activeElement)) {
                publishEditingField(null);
            } else {
                // Moved to another control — focusin already published (or will).
                const fieldId = resolveEditingFieldId(document.activeElement);
                publishEditingField(fieldId);
            }
        });
    }

    /**
     * @param {HTMLElement} inspectorDiv
     */
    function attachInspector(inspectorDiv) {
        if (inspectorRoot) {
            inspectorRoot.removeEventListener('focusin', onInspectorFocusIn);
            inspectorRoot.removeEventListener('focusout', onInspectorFocusOut);
            inspectorObserver?.disconnect();
            clearFieldEditorStrips();
        }
        inspectorRoot = inspectorDiv;
        inspectorDiv.addEventListener('focusin', onInspectorFocusIn);
        inspectorDiv.addEventListener('focusout', onInspectorFocusOut);
        inspectorObserver = new MutationObserver(() => {
            if (!fieldEditorsMutating) {
                scheduleFieldRefresh();
            }
        });
        inspectorObserver.observe(inspectorDiv, { childList: true, subtree: true });
        scheduleFieldRefresh();
    }

    const onAwarenessChange = () => {
        refreshEditors();
    };
    awareness.on('change', onAwarenessChange);

    // New nodes appear after remote sync — refresh dots when the node set grows.
    const onModelChange = (evt) => {
        if (evt.change === go.ChangeType.Insert && evt.propertyName === 'nodeDataArray') {
            refreshEditors();
        }
    };
    diagram.addModelChangedListener(onModelChange);
    diagram.addDiagramListener('ChangedSelection', refreshEditorsAfterSelection);

    // Initial paint once theme / nodes are ready.
    requestAnimationFrame(refreshEditors);

    return {
        publishEditingKey,
        publishEditingField,
        attachInspector,
        refreshEditors,
        refreshFieldEditors,
        destroy() {
            awareness.off('change', onAwarenessChange);
            diagram.removeModelChangedListener(onModelChange);
            diagram.removeDiagramListener('ChangedSelection', refreshEditorsAfterSelection);
            if (inspectorRoot) {
                inspectorRoot.removeEventListener('focusin', onInspectorFocusIn);
                inspectorRoot.removeEventListener('focusout', onInspectorFocusOut);
            }
            inspectorObserver?.disconnect();
            inspectorObserver = null;
            clearFieldEditorStrips();
            inspectorRoot = null;
            diagram.nodes.each((node) => {
                if (node instanceof go.Node) {
                    node.removeAdornment(EDITORS_ADORNMENT);
                }
            });
            try {
                awareness.setLocalStateField('editingFuncKey', null);
                awareness.setLocalStateField('editingFieldId', null);
            } catch (_) {
                // awareness may already be destroyed with the provider
            }
        },
    };
}
