/**
 * Hit-testing and gesture arbitration for function nodes:
 * select / rename / horizontal reorder / call linking.
 */

import go from 'gojs';

/** Extra pick radius outside BODY, in document units (does not affect layout). */
export const NODE_GESTURE_HALO = 10;

/**
 * @typedef {'halo' | 'border' | 'parens' | 'name' | 'interior'} NodeGestureZone
 * @typedef {{ node: go.Node, zone: NodeGestureZone }} NodeGestureHit
 */

/**
 * Whether a drag from this zone/direction should start LinkingTool.
 * @param {NodeGestureZone} zone
 * @param {boolean} canReorder
 * @param {number} dx
 * @param {number} dy
 */
export function shouldStartLinking(zone, canReorder, dx, dy) {
    if (zone === 'border' || zone === 'halo' || zone === 'parens') return true;
    if (zone === 'name' || zone === 'interior') {
        if (!canReorder) return true;
        return Math.abs(dy) >= Math.abs(dx);
    }
    return false;
}

/**
 * Whether a drag from this zone/direction should start DraggingTool (sibling reorder).
 * @param {NodeGestureZone} zone
 * @param {boolean} canReorder
 * @param {number} dx
 * @param {number} dy
 */
export function shouldStartDragging(zone, canReorder, dx, dy) {
    if (zone === 'border' || zone === 'halo' || zone === 'parens') return false;
    if (zone === 'name' || zone === 'interior') {
        if (!canReorder) return false;
        return Math.abs(dx) > Math.abs(dy);
    }
    return false;
}

/**
 * Classify which named object (or halo) was pressed on a function node.
 * @param {go.Diagram} diagram
 * @param {go.Point} docPoint
 * @returns {NodeGestureHit | null}
 */
export function hitNodeGesture(diagram, docPoint) {
    const obj = diagram.findObjectAt(docPoint);
    if (obj) {
        const part = obj.part;
        if (part instanceof go.Node && !part.data?.isGroup) {
            const zone = zoneForObject(obj, part);
            if (zone) return { node: part, zone };
            return null;
        }
        // Click on a link or other part — not a node gesture.
        if (part && !(part instanceof go.Node)) return null;
    }

    let best = null;
    let bestDist = Infinity;
    diagram.nodes.each((n) => {
        if (!(n instanceof go.Node) || n.data?.isGroup) return;
        const body = n.findObject('BODY');
        if (!body) return;
        const bounds = body.getDocumentBounds();
        if (bounds.containsPoint(docPoint)) {
            if (0 < bestDist) {
                bestDist = 0;
                best = { node: n, zone: /** @type {NodeGestureZone} */ ('interior') };
            }
            return;
        }
        const inflated = bounds.copy().inflate(NODE_GESTURE_HALO, NODE_GESTURE_HALO);
        if (!inflated.containsPoint(docPoint)) return;
        const dist = distanceOutsideRect(docPoint, bounds);
        if (dist < bestDist) {
            bestDist = dist;
            best = { node: n, zone: /** @type {NodeGestureZone} */ ('halo') };
        }
    });
    return best;
}

/**
 * @param {go.GraphObject} obj
 * @param {go.Node} node
 * @returns {NodeGestureZone | null}
 */
function zoneForObject(obj, node) {
    for (let x = obj; x && x !== node; x = x.panel) {
        if (x.name === 'BUTTON_EXPAND') return null;
        if (x.name === 'PARENS') return 'parens';
        if (x.name === 'NAME') return 'name';
        if (x.name === 'NAME_PANEL') return 'interior';
        if (x.name === 'SHAPE') return 'border';
        if (x.name === 'BODY') return 'interior';
    }
    return 'interior';
}

/** Distance from point to the nearest edge of rect (0 if inside). */
function distanceOutsideRect(p, rect) {
    const cx = Math.min(Math.max(p.x, rect.left), rect.right);
    const cy = Math.min(Math.max(p.y, rect.top), rect.bottom);
    const dx = p.x - cx;
    const dy = p.y - cy;
    return Math.hypot(dx, dy);
}
