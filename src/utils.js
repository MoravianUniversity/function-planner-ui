/** Utility functions. */

import diff from 'fast-diff';

import addIcon from '../images/add.svg';
import removeIcon from '../images/remove.svg';

/**
 * Map a cursor offset in oldText to the corresponding offset in newText.
 * Used so collaborative remote edits don't leave the caret stranded.
 * Inserts at the caret use before-bias (caret does not jump past the insert).
 * @param {string} oldText
 * @param {string} newText
 * @param {number} cursor
 * @returns {number}
 */
export function mapCursorOffset(oldText, newText, cursor) {
    if (typeof cursor !== 'number' || cursor < 0) { return 0; }
    const parts = diff(oldText, newText);
    let oldPos = 0;
    let mapped = cursor;
    for (const [op, text] of parts) {
        const len = text.length;
        if (op === diff.EQUAL) {
            oldPos += len;
        } else if (op === diff.DELETE) {
            if (cursor >= oldPos + len) {
                mapped -= len;
            } else if (cursor > oldPos) {
                mapped -= cursor - oldPos;
            }
            oldPos += len;
        } else if (op === diff.INSERT) {
            if (cursor > oldPos) {
                mapped += len;
            }
        }
    }
    return Math.max(0, Math.min(mapped, newText.length));
}

/**
 * Set an input/textarea value. When the element is focused, preserve (and
 * adjust) the selection so remote collaborative updates don't jump the caret
 * to the end of the field.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} value
 * @returns {boolean} True if the value changed.
 */
export function setTextInputValue(el, value) {
    value = value ?? '';
    if (el.value === value) { return false; }
    const focused = document.activeElement === el;
    if (!focused) {
        el.value = value;
        return true;
    }
    const oldValue = el.value;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = value;
    if (typeof start === 'number') {
        const newStart = mapCursorOffset(oldValue, value, start);
        const newEnd = typeof end === 'number' ? mapCursorOffset(oldValue, value, end) : newStart;
        try {
            el.setSelectionRange(newStart, newEnd);
        } catch (_) {
            // Some input types do not support selection ranges.
        }
    }
    return true;
}

/**
 * Deep equality check for two values, recursively checking objects and arrays.
 * @param {*} a
 * @param {*} b 
 * @returns {boolean} True if a and b are deeply equal, false otherwise.
 */
export function deepEquals(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) && Array.isArray(b) && a.length == b.length && a.every((x, i) => deepEquals(x, b[i]))) return true;
    if (Object.keys(a).length !== Object.keys(b).length) return false;
    return Object.keys(a).every(key => (key in b) && deepEquals(a[key], b[key]));
}

/**
 * Deep copy an object or value. Must be JSON-serializable.
 * @param {object} obj The object or value to copy.
 * @returns {object} A deep copy of the input object or value.
 */
export function dup(obj) { return JSON.parse(JSON.stringify(obj)); }

/**
 * Load an SVG file from the given path and insert it into the given element.
 * @param {string} path The path to the SVG file.
 * @param {HTMLElement} elem The element to insert the SVG into.
 * @param {string} fallback Fallback text to display if loading fails, default is empty string.
 */
export function loadSVG(path, elem, fallback='') {
    fetch(path).then(response => response.text())
        .then(svg => { elem.innerHTML = svg; })
        .catch(err => {
            console.error(`Error loading SVG from ${path}:`, err);
            elem.textContent = fallback;
        });
}

/**
 * Escape HTML special characters in a string.
 * @param {string} unsafe The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Create an <option> element for a <select> input.
 * @param {string} value The value attribute of the option.
 * @param {string} text The display text of the option.
 * @returns {HTMLOptionElement} The created option element.
 */
export function makeOption(value, text) {
    let option = document.createElement("option");
    option.value = value;
    option.text = text || value;
    return option;
}

/**
 * Convert an HTML string to a DOM node.
 * @param {string} html The HTML string.
 * @returns {HTMLElement} The resulting DOM node.
 */
export function htmlToNode(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstElementChild;
}

/**
 * Check if the current platform is macOS.
 * @returns {boolean} True if the platform is macOS, false otherwise.
 */
export function isMacOS() {
    const platform = window.navigator?.userAgentData?.platform || window.navigator.platform;
    return platform.toLowerCase().indexOf('mac') !== -1;
}

/**
 * Create a button element for adding items, with appropriate styling and SVG icon.
 * @returns {HTMLElement} The created add button element.
 */
export function makeAddButton(onclick = null) { return makeButton("add", onclick); }

/**
 * Create a button element for removing items, with appropriate styling and SVG icon.
 * @returns {HTMLElement} The created remove button element.
 */
export function makeRemoveButton(onclick = null) { return makeButton("remove", onclick); }

function makeButton(name, onclick = null) {
    const button = document.createElement("div");
    button.className = `func-button func-button-${name}`;
    loadSVG(name === "remove" ? removeIcon : addIcon, button, name === "remove" ? "x" : "+");
    if (onclick) {
        button.addEventListener("click", onclick);
    }
    return button;
}
