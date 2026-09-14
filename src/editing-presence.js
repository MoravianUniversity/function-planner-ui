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

/**
 * Wire Yjs awareness ↔ function-box editor dots.
 * @param {go.Diagram} diagram
 * @param {object} options
 * @param {import('y-protocols/awareness').Awareness} [options.awareness]
 * @param {string[]|null} [options.externalAuthors]
 * @returns {{ publishEditingKey: (key: string|null) => void, refreshEditors: () => void, destroy: () => void }}
 */
export function setupEditingPresence(diagram, options) {
    const awareness = options.awareness;
    const noop = {
        publishEditingKey() {},
        refreshEditors() {},
        destroy() {},
    };
    if (!awareness) {
        return noop;
    }

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

    /**
     * @returns {Map<string, { authorId: string, name: string, color: string }[]>}
     */
    function buildEditorsByKey() {
        const authors = Array.isArray(options.externalAuthors) ? options.externalAuthors : [];
        const maxGroup = diagram.themeManager.maxGroup || 5;
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
            const authorId = typeof state.authorId === 'string' ? state.authorId.trim() : '';
            const name =
                (typeof state.name === 'string' && state.name.trim()) ||
                authorId ||
                '';
            // Skip clients that never published identity (e.g. staff without membership).
            if (!authorId && !name && !state.userId) {
                return;
            }
            const idx = authorId ? authors.indexOf(authorId) : -1;
            const group = idx >= 0 ? (idx % maxGroup) + 1 : 0;
            const entry = {
                authorId,
                name: name || 'Someone',
                color: groupDotFill(group),
            };
            const list = byKey.get(String(key)) ?? [];
            list.push(entry);
            byKey.set(String(key), list);
        });
        return byKey;
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
        const local = awareness.getLocalState();
        // Only advertise editing when the host published identity (plan members).
        if (!local || (!local.authorId && !local.userId && !local.name)) {
            return;
        }
        awareness.setLocalStateField('editingFuncKey', key == null || key === '' ? null : key);
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
        refreshEditors,
        destroy() {
            awareness.off('change', onAwarenessChange);
            diagram.removeModelChangedListener(onModelChange);
            diagram.removeDiagramListener('ChangedSelection', refreshEditorsAfterSelection);
            diagram.nodes.each((node) => {
                if (node instanceof go.Node) {
                    node.removeAdornment(EDITORS_ADORNMENT);
                }
            });
            try {
                awareness.setLocalStateField('editingFuncKey', null);
            } catch (_) {
                // awareness may already be destroyed with the provider
            }
        },
    };
}
