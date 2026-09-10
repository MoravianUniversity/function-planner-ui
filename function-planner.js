/**
 * This file contains the code for the function planner tool.
 *
 * Future ideas:
 *  - some initial model settings propagate into in-progress model without resetting? (i.e. new functions, into read-only functions, etc)
 *  - a few less parentheses in the type editor string generation (and can dicts nest?)
 *  - server side saving and loading of plans, collaboration, instructor side of things
 */

import go from 'gojs';

import { makeAllButtons } from './src/buttons.js';
import { Model } from './src/model.js';
import { setupDiagram } from './src/diagram.js';
import { setupDragAndDrop } from './src/save-load.js';
import { setupProblemChecking } from './src/problem-checker.js';
import { setupInspector } from './src/inspector.js';
import { makeFunctionInspector } from './src/function-inspector.js';
import { makeModuleInspector } from './src/module-inspector.js';

import './function-planner.css';

const BASIC_MODEL = {
    functions: [{ key: "1", name: 'main' },],
    calls: []
};
const DEFAULT_ALLOWED_TYPES = ['int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'set'];

/**
 * Initialize the Function Planner in the given root element.
 * @param {HTMLElement|string} rootElem
 * @param {string} planId - Module/plan identifier used for downloads, exports, and IndexedDB when enabled
 *   (prefer a human-readable base plan id, not a student-plan UUID)
 * @param {object} options - Additional options
 * @param {string} options.title - Title to show at the top of the diagram, optional
 * @param {object} options.initialModel - Initial model to load if no saved model exists, defaults to a basic plan with a single "main" function
 * @param {string[]} options.allowedTypes - List of allowed types for function parameters and returns
 * @param {number} options.minFunctions - Minimum number of functions required (for validation), defaults to 1
 * @param {number} options.maxFunctions - Maximum number of functions allowed (for validation), defaults to Infinity
 * @param {number} options.minTestable - Minimum number of testable functions required (for validation), defaults to 0
 * @param {number} options.maxTestable - Maximum number of testable functions allowed (for validation), defaults to Infinity
 * @param {number} options.minInputFuncs - Minimum number of input-only functions required (for validation), defaults to 0
 * @param {number} options.maxInputFuncs - Maximum number of input-only functions allowed (for validation), defaults to Infinity
 * @param {number} options.minOutputFuncs - Minimum number of output-only functions required (for validation), defaults to 0
 * @param {number} options.maxOutputFuncs - Maximum number of output-only functions allowed (for validation), defaults to Infinity
 * @param {number} options.minModuleDescLength - Minimum length of module description (for validation), defaults to 25
 * @param {number} options.minFuncDescLength - Minimum length of function description (for validation), defaults to 20
 * @param {number} options.minParamDescLength - Minimum length of parameter description (for validation), defaults to 12
 * @param {number} options.minReturnDescLength - Minimum length of return description (for validation), defaults to 12
 * @param {string} options.docStyle - Docstring style to use (numpy, google, sphinx, epydoc), defaults to "numpy"
 * @param {boolean} options.canClaimFuncs - If true, functions can be "claimed" by one author, colorizing/exporting them separately
 * @param {boolean} options.adminMode - If true, enables admin mode features (nothing is read-only or not shown, allows editing read-only properties)
 * @param {boolean} options.callGraphOnly - If true, hides the module and function inspectors, only shows the call graph (and suppresses most problem checking)
 * @param {boolean} [options.showSaveJSON] If false, hides the Save as JSON toolbar button (default true)
 * @param {boolean} [options.showLoadJSON] If true, shows Load from JSON even in collaborative mode (default: non-collab editable only)
 * @param {string[]|null} [options.externalAuthors] When non-null (collaborative hosts),
 *   authors are locked to this list (typically plan members) instead of free-text entry.
 * @param {import('yjs').Doc} [options.ydoc] External Y.Doc shared with a WebsocketProvider (server is source of truth)
 * @param {boolean} [options.useIndexedDB] Local IndexedDB persistence; defaults to false when ydoc is set, otherwise true
 * @param {boolean} [options.readonly] Global read-only mode (diagram + inspectors still visible)
 * @param {string} [options.licenseKey] GoJS license key (optional; academic demos may omit)
 * @param {{ title: string, icon: string, onClick?: function, disabled?: boolean }[][]} [options.extraFabs]
 *   Extra bottom-left FAB groups (arrays of { title, icon, onClick, disabled? }), stacked above theme/settings/help
 * @returns {{ model: Model, diagram: go.Diagram, destroy: () => void }}
 */
export default function init(
    rootElem,
    planId,
    options={},
) {
    rootElem = typeof rootElem === 'string' ? document.getElementById(rootElem) : rootElem;
    rootElem.classList.add("func-planner");

    options = { ...options };
    options.title = options.title || null;
    options.initialModel = options.initialModel ?? BASIC_MODEL;
    options.allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
    options.adminMode = options.adminMode ?? false;
    options.callGraphOnly = options.callGraphOnly ?? false;
    options.canClaimFuncs = options.canClaimFuncs ?? false;
    options.showSaveJSON = options.showSaveJSON ?? true;
    options.showLoadJSON = options.showLoadJSON ?? false;
    options.externalAuthors = options.externalAuthors ?? null;
    options.readonly = options.readonly ?? false;
    options.useIndexedDB = options.useIndexedDB ?? !options.ydoc;
    options.collaborative = Boolean(options.ydoc) || options.useIndexedDB === false;
    options.extraFabs = options.extraFabs ?? [];
    options.theme = localStorage.getItem('func-planner-theme') === 'dark' ? 'dark' : 'light';

    if (options.readonly && !options.adminMode) {
        rootElem.classList.add('func-planner--readonly');
    }

    const model = new Model(planId, options.initialModel, {
        ydoc: options.ydoc,
        useIndexedDB: options.useIndexedDB,
    });
    const diagram = setupDiagram(rootElem, model, options);
    makeAllButtons(diagram, model, options);
    if (!options.collaborative) {
        setupDragAndDrop(model, options, diagram.div);
    }
    setupProblemChecking(model, options);

    // Show the appropriate inspector based on selection
    if (!options.callGraphOnly) {
        const inspectorDiv = setupInspector(diagram.div);
        const moduleInspector = makeModuleInspector(model, options);
        const [funcInspector, setFuncInspectorKey] = makeFunctionInspector(model, options);
        inspectorDiv.append(moduleInspector, funcInspector);
        funcInspector.style.display = 'none';
        diagram.addDiagramListener('ChangedSelection', (e) => {
            let subject = e.subject.first();
            if (!subject) {
                moduleInspector.style.display = '';
                funcInspector.style.display = 'none';
            } else if (subject instanceof go.Link) {
                return; // keep same
                // or could show the fromNode in function inspector or revert to module inspector
            } else {
                setFuncInspectorKey(subject.data.key);
                moduleInspector.style.display = 'none';
                funcInspector.style.display = '';
            }
        });
    }

    return {
        model,
        diagram,
        /**
         * Replace authors from an external source (plan members). Pass null to
         * stop treating authors as externally owned (local demos only).
         * @param {string[]|null} names
         */
        setExternalAuthors(names) {
            options.externalAuthors = names;
            if (names == null) {
                return;
            }
            model.syncExternalAuthors(names);
        },
        destroy() {
            try {
                diagram.div?.querySelectorAll('*');
                diagram.clear();
                if (diagram.div?.parentNode) {
                    diagram.div.parentNode.removeChild(diagram.div);
                }
                diagram.div = null;
            } catch (_) {
                // diagram may already be torn down
            }
            model.destroy();
            if (rootElem) {
                rootElem.replaceChildren();
                rootElem.classList.remove('func-planner', 'dark-mode', 'func-planner--readonly');
            }
        },
    };
}

export { BASIC_MODEL, DEFAULT_ALLOWED_TYPES, Model };
