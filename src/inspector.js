/**
 * General UI elements for the function and module inspectors.
 */

import Prism from "prismjs";
import 'prismjs/components/prism-python.min.js';

/**
 * Sets up a resizable inspector div next to the diagram div.
 * @param {HTMLElement} diagramDiv - the diagram div
 * @returns {HTMLElement} the inspector div
 */
export function setupInspector(diagramDiv) {
    const rootElem = diagramDiv.parentNode;

    const resizer = document.createElement('div');
    resizer.className = 'inspector-resizer';

    const inspectorDiv = document.createElement('div');
    inspectorDiv.className = 'inspector';
    rootElem.append(resizer, inspectorDiv);

    const width = rootElem.clientWidth;
    const initialLeft = Math.min(width - 300, width * 0.8);
    diagramDiv.style.width = `${initialLeft}px`;
    resizer.style.left = `${initialLeft}px`;
    inspectorDiv.style.left = `${initialLeft + resizer.clientWidth}px`;

    function setX(x) {
        diagramDiv.style.width = `${x}px`;
        resizer.style.left = `${x}px`;
        inspectorDiv.style.left = `${x + resizer.clientWidth}px`;
    }

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const onMouseMove = (e) => {
            const rootElemX = rootElem.getBoundingClientRect().left;
            setX(Math.max(200, Math.min(e.clientX - rootElemX, rootElem.clientWidth - 200)));
        }
        const onMouseUp = () => {
            rootElem.removeEventListener('mousemove', onMouseMove);
            rootElem.removeEventListener('mouseup', onMouseUp);
        };
        rootElem.addEventListener('mousemove', onMouseMove);
        rootElem.addEventListener('mouseup', onMouseUp);
    });
    let lastWidth = width;
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            let newWidth = entry.contentRect.width;
            if (newWidth !== lastWidth) {
                const curX = parseFloat(diagramDiv.style.width);
                setX(Math.max(200, Math.min(newWidth - 200, newWidth * curX / lastWidth)));
                lastWidth = newWidth;
            }
        }
    });
    resizeObserver.observe(rootElem);

    return inspectorDiv;
}

/**
 * Creates a div that shows the problems in the data.
 * @param {function} listen 
 * @returns {HTMLElement} the problems div
 */
export function makeProblemsDiv(listen) {
    const problemsDiv = document.createElement('div');
    problemsDiv.className = 'problems';
    listen((_, problems) => { updateProblemsInInspector(problemsDiv.parentNode, problems); });
    return problemsDiv;
}

/**
 * Updates the problems shown in the inspector. This highlights fields with problems
 * and shows a list of problems.
 * @param {HTMLElement} div 
 * @param {Array} problems 
 */
function updateProblemsInInspector(div, problems) {
    // update the highlighting
    for (const elem of Array.from(div.getElementsByClassName('error'))) { elem.classList.remove('error'); elem.title = ''; }
    for (const elem of Array.from(div.getElementsByClassName('warning'))) { elem.classList.remove('warning'); elem.title = ''; }
    for (const [type, fields, message] of problems) {
        for (const field of fields.split(',')) {
            let elem;
            if (field.includes("[")) {
                // handle array-like fields (e.g., params[0].name)
                const [baseField, rem] = field.split('[');
                const [index, name_] = rem.split(']');
                const name = name_.slice(1);
                elem = div.getElementsByClassName(`func-${baseField}`)[0]
                    ?.getElementsByClassName(`func-var-${name}`)[index];
            } else {
                elem = div.getElementsByClassName(`func-${field}`)[0];
            }
            if (elem) {
                elem.classList.add(type);
                elem.title = message;
            }
        }
    }

    // update the problems div
    const problemsDiv = div.querySelector('div.problems');
    if (problems.length > 0) {
        problemsDiv.innerHTML = '<h3>Problems</h3><ul class="problems">' + 
            problems.map(p => `<li class="${p[0]}">${p[2]}</li>`).join('') + '</ul>';
    } else {
        problemsDiv.innerHTML = '';
    }
}

/**
 * Wraps an element with a label. The text is placed before the element in a span.
 * @param {HTMLElement} elem 
 * @param {string} text 
 * @returns {HTMLElement} the label element
 */
export function wrapWithLabel(elem, text) {
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = text;
    label.append(span, elem);
    return label;
}

/**
 * Creates a checkbox for a particular field in the data.
 * @param {string} field 
 * @param {{set: function, listen: function, listenRO: function}} funcs
 * @returns {HTMLElement} the checkbox element
 */
export function makeCheckbox(field, funcs) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = `func-${field}`;
    checkbox.addEventListener('change', (e) => { funcs.set(field, e.target.checked); });
    funcs.listen(field, (value) => { checkbox.checked = value; });
    funcs.listenRO(field, (readOnly) => { checkbox.disabled = readOnly; });
    return checkbox;
}

/**
 * Creates a textarea for a particular field in the data.
 * @param {string} field 
 * @param {{set: function, listen: function, listenRO: function}} funcs
 * @param {object} attrs 
 * @returns {HTMLElement} the textarea element
 */
export function makeTextarea(field, funcs, attrs={}) {
    const textarea = document.createElement('textarea');
    let resize = () => {};

    // auto-resize the textarea if field-sizing is not supported
    if (!CSS.supports("field-sizing: content")) {
        resize = () => {
            textarea.style.height = "";
            textarea.style.height = textarea.scrollHeight + 5 + "px";
        };
        textarea.addEventListener('input', resize);
        setTimeout(() => {
            if (textarea.scrollHeight > 0) {
                textarea.style.height = textarea.scrollHeight + 5 + "px";
            }
        }, 0);
    }

    // set up the textarea
    textarea.className = `func-${field}`;
    for (const [k, v] of Object.entries(attrs)) { textarea[k] = v; }
    textarea.addEventListener('input', (e) => { funcs.set(field, e.target.value, e.target.selectionStart); });
    funcs.listen(field, (value) => {
        value = value?.toString() || '';
        if (textarea.value !== value) {
            textarea.value = value;
            textarea.rows = value.trim().split('\n').length + 2;
            resize();
        }
    });
    funcs.listenRO(field, (readOnly) => { textarea.readOnly = readOnly; });

    return textarea;
}

/**
 * Creates a code editor for a particular field. If the field is read-only,
 * it creates a syntax-highlighted div instead of a textarea.
 * @param {string} field 
 * @param {{set: function, listen: function, listenRO: function}} funcs
 * @param {string} title 
 * @param {string} placeholder 
 * @returns {HTMLElement} the code editor element
 */
export function makeCodeEditor(field, funcs,
    title = 'Function Code', placeholder = '# Write your function code here\n') {
    const div = document.createElement('div');
    div.className = `func-code-box`;

    const label = document.createElement('label');
    label.textContent = title;

    const textarea = makeTextarea(field, funcs, {placeholder});
    textarea.classList.add('code-box');
    div.append(label, textarea);

    const codeBox = document.createElement('div');
    codeBox.className = `func-${field} language-python code-box`;
    funcs.listen(field, (value) => {
        value = value?.toString() || ' ';
        codeBox.innerHTML = Prism.highlight(value, Prism.languages.python, 'python');
    });
    funcs.listenRO(field, (readOnly) => {
        textarea.style.display = readOnly ? 'none' : '';
        codeBox.style.display = !readOnly ? 'none' : '';
    });
    div.appendChild(codeBox);

    return div;
}

/**
 * Creates a code editor for a particular field with PlanConfig-driven visibility.
 * If the field is read-only, it creates a syntax-highlighted div instead of a textarea.
 * Visibility can come from:
 * - PlanConfig boolean via `visibility.showFromOptions` (module-level)
 * - PlanConfig name regex via `visibility.namePatternOption` (per-function code/tests)
 * Admin mode always shows the editor.
 * @param {object} options
 * @param {string} field 
 * @param {{set: function, listen: function, listenRO: function}} funcs
 * @param {string} title 
 * @param {string} placeholder
 * @param {{ showFromOptions?: string, namePatternOption?: string }} [visibility]
 */
export function makeCodeEditorWithVisibility(options, field, funcs, title, placeholder, visibility={}) {
    const showFromOptions = visibility.showFromOptions;
    const namePatternOption = visibility.namePatternOption;
    const div = makeCodeEditor(field, funcs, title, placeholder);
    if (options.adminMode) {
        // Template authors always see editors; visibility for students is PlanConfig.
    } else {
        let showing = false, val = '', ro = false, funcName = '';
        function updateVisibility() { div.style.display = showing && (val || !ro) ? '' : 'none'; }
        function refreshShowing() {
            if (namePatternOption) {
                showing = functionNameMatchesPattern(funcName, options[namePatternOption]);
            } else if (showFromOptions) {
                showing = Boolean(options[showFromOptions]);
            }
            updateVisibility();
        }
        if (namePatternOption) {
            funcs.listen('name', (value) => {
                funcName = value?.toString() || '';
                refreshShowing();
            });
        } else if (showFromOptions) {
            refreshShowing();
        }
        funcs.listen(field, (value) => { val = value?.toString() || ''; updateVisibility(); });
        funcs.listenRO(field, (readOnly) => { ro = readOnly; updateVisibility(); });
        updateVisibility();
    }
    return div;
}

/** Empty/invalid patterns match nothing. */
function functionNameMatchesPattern(name, pattern) {
    const raw = typeof pattern === 'string' ? pattern.trim() : '';
    if (!raw) { return false; }
    try {
        return new RegExp(raw).test(name);
    } catch {
        return false;
    }
}

/**
 * Effective per-function read-only from PlanConfig.functionReadOnly rules.
 * Matching rules merge: true wins; otherwise field names are unioned.
 * @param {string} name
 * @param {{ for: string, fields: true|string[] }[]|null|undefined} rules
 * @returns {boolean|string[]}
 */
export function resolveFunctionReadOnly(name, rules) {
    if (!Array.isArray(rules) || rules.length === 0) { return false; }
    const fields = new Set();
    for (const rule of rules) {
        if (!rule || typeof rule.for !== 'string' || !functionNameMatchesPattern(name, rule.for)) {
            continue;
        }
        if (rule.fields === true) { return true; }
        if (Array.isArray(rule.fields)) {
            for (const field of rule.fields) { fields.add(field); }
        }
    }
    return fields.size === 0 ? false : [...fields];
}

/**
 * Checks if a particular part of a read-only policy applies.
 * Policy is a boolean (all/none) or an array of field names from PlanConfig
 * (moduleReadOnly / resolveFunctionReadOnly).
 * The part/type can be:
 *      one of the fields: 'name', 'params', 'returns', 'desc', 'io', 'testable', 'code', …
 *      one of the sub-fields: 'params.{name}', 'params[{index}]', 'returns[{index}]'
 *      one of the special values: 'calls', 'callsInto', 'callsOutOf'
 *      module fields: 'documentation', 'testDocumentation', 'globalCode', 'testGlobalCode'
 * @param {boolean|string[]} policy
 * @param {string} type
 * @param {{ adminMode?: boolean }} [options]
 * @returns {boolean} whether the type is read-only
 */
export function isReadOnly(policy, type, options={}) {
    if (options.adminMode) { return false; }
    return (policy === true || (Array.isArray(policy) && policy.includes(type)));
}
