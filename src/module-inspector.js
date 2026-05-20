/**
 * Functions for setting up and managing the module inspector that displays
 * when no function is selected.
 */

import { wrapWithLabel, makeTextarea, makeCodeEditorWithVisibility, makeProblemsDiv, isReadOnly } from './inspector.js';
import { DEFAULT_PROGRAM_HEADER } from './save-load.js';
import { makeAddButton, makeRemoveButton } from './utils.js';

/**
 * Creates the module inspector div.
 * @param {*} model 
 * @param {object} options 
 * @returns {HTMLElement} the module inspector div
 */
export function makeModuleInspector(model, options) {
    const div = document.createElement('div');

    function set(property, value, cursorPos=null) { model.updateModelData(property, value, cursorPos); }
    function listen(property, listener) { model.addModelDataListener(property, (_, value) => listener(value)); }
    function listenRO(property, listener) {
        if (options.adminMode) { listener(false); }
        else {
            listener(isReadOnly(options.moduleReadOnly ?? false, property));
        }
    }
    const funcs = {set, listen, listenRO};

    div.append(
        ...makeHeader(model),
        makeModuleDesc(funcs),
        makeAuthorNames(model, options, funcs),
        makeTestDocumentation(model, options, funcs)
    );
    div.appendChild(makeGlobalCodeEditor(options, funcs));
    div.appendChild(makeTestGlobalCodeEditor(options, funcs));
    div.appendChild(makeProblemsDiv((listener) => model.addModelDataListener('problems', listener)));

    model.fireModelDataListeners();

    return div;
}

function makeHeader(model) {
    const title = document.createElement('h2');
    title.textContent = (model.id || 'Module');
    const info = document.createElement('p');
    info.innerHTML = 'Select a function to edit it.<br>Edit program-wide settings here.';
    return [title, info];
}

function makeModuleDesc(funcs) {
    return makeTextarea('documentation', funcs,
        {placeholder: DEFAULT_PROGRAM_HEADER, required: true});
}

function makeAuthorNames(model, options, funcs) {
    const container = document.createElement('div');
    container.className = 'func-authors';
    if (options.canClaimFuncs) {
        container.classList.add('func-authors-claimable');
    }

    const list = document.createElement('div');
    list.className = 'func-authors-list';

    const label = document.createElement('label');
    label.textContent = 'By:';
    label.id = 'func-authors-label';

    // Base-plan admin templates: authors optional/display-only.
    // Collaborative hosts: authors locked to plan members (externalAuthors).
    const authorsFromMembers = options.externalAuthors != null;
    const authorsLocked = Boolean(options.adminMode) || authorsFromMembers;
    let readOnly = authorsLocked;

    function currentValues() {
        return [...list.getElementsByTagName('input')].map((input) => input.value.trim());
    }

    function set(input, newName) {
        const index = [...list.getElementsByTagName('input')].indexOf(input);
        const oldName = model.modelData.get('authors')?.get(index)?.toString() || '';
        funcs.set(`authors[${index}]`, newName, input.selectionStart);
        model.functions.forEach((func) => {
            if (func.get('owner')?.toString() === oldName) {
                if (!newName) {
                    func.delete('owner');
                } else {
                    func.set('owner', newName);
                }
            }
        });
    }

    function makeAuthorRow(name) {
        const row = document.createElement('div');
        row.className = 'func-author-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Author name...';
        input.value = name;
        input.readOnly = readOnly;
        input.writingSuggestions = 'false';
        input.ariaLabelledByElements = [label];
        input.addEventListener('input', () => {
            if (input.value.startsWith(' ')) {
                input.value = input.value.trimStart();
            }
            if (input.value.length > 0 && input.value[0] === input.value[0].toLowerCase()) {
                input.value = input.value[0].toUpperCase() + input.value.slice(1);
            }
            set(input, input.value);
        });

        row.append(input, makeRemoveButton(() => {
            set(input, null);
            if (list.childElementCount === 1) {
                input.value = '';
            } else {
                row.remove();
            }
        }));

        return row;
    }

    container.append(list, makeAddButton(() => {
        const empty = currentValues().indexOf('');
        if (empty !== -1) {
            list.children[empty].querySelector('input').focus();
        } else {
            list.appendChild(makeAuthorRow(''));
            list.lastElementChild.querySelector('input').focus();
        }
    }));

    // Cannot use wrapWithLabel here because there are multiple inputs
    const outer = document.createElement('div');
    outer.append(label, container);

    funcs.listen('authors', (value) => {
        const trimmed = (value && value.length > 0) ? value.map((v) => v.trim()) : [];
        const names = authorsLocked
            ? trimmed.filter((name) => name.length > 0)
            : (trimmed.length > 0 ? trimmed : ['']);
        if (authorsFromMembers) {
            outer.style.display = '';
        } else if (authorsLocked) {
            // adminMode template: only show if seed JSON already has authors
            outer.style.display = names.length > 0 ? '' : 'none';
        }
        const current = currentValues();
        if (current.length !== names.length || current.some((name, index) => name !== names[index])) {
            const selected = list.querySelector('input:focus')?.value;
            list.replaceChildren(...names.map(name => makeAuthorRow(name)));
            if (selected != null) { list.querySelector(`input[value="${selected}"]`)?.focus(); }
        }
    });

    if (authorsLocked) {
        container.classList.add('func-authors-read-only');
        if (authorsFromMembers) {
            label.title = 'Authors are the members of this plan';
        }
    } else {
        funcs.listenRO('authors', (value) => {
            readOnly = value;
            container.classList.toggle('func-authors-read-only', readOnly);
            for (const input of list.getElementsByTagName('input')) { input.readOnly = readOnly; }
        });
    }

    return outer;
}

function makeTestDocumentation(model, options, funcs) {
    const textarea = makeTextarea('testDocumentation', funcs,
            {placeholder: `Tests for the "${model.id}" module`});
    const label = wrapWithLabel(textarea, 'Test Documentation');
    if (!options.adminMode) {
        function toggleShowing() {
            const hasTestable = Array.from(model.functions.values()).some(n => n.get('testable'));
            label.style.display = hasTestable && options.showTestDocumentation ? '' : 'none';
        }
        model.addFuncListener('testable', toggleShowing);
        toggleShowing();
    }
    return label;
}

function makeGlobalCodeEditor(options, funcs) {
    return makeCodeEditorWithVisibility(options, 'globalCode', funcs,
        'Global Code', '# Write your module-level code here (e.g. imports)\n',
        { showFromOptions: 'showGlobalCode' });
}

function makeTestGlobalCodeEditor(options, funcs) {
    return makeCodeEditorWithVisibility(options, 'testGlobalCode', funcs,
        'Test Global Code', '# Write code here to set up your tests (e.g. test imports, helper functions)\n',
        { showFromOptions: 'showTestGlobalCode' });
}
