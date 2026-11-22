import './document-sheet.css';
import { updateLibrary, type Action, type Folder, type DocumentFile, type Library } from './document-library.ts';
import { documentStorage, type HostStorage } from './document-storage.ts';

type FormType = 'new-folder' | 'rename-file' | 'rename-folder' | 'move-file' | 'delete-file' | 'delete-folder';
type Options = { writer: () => HTMLTextAreaElement; onSelect: (file: DocumentFile) => void; onNameChange?: (file: DocumentFile) => void; onRecovery?: (file: DocumentFile) => void; onStorageReady?: () => void; compositionPending: () => boolean; fixture?: boolean; expectBridge?: boolean };
function required<T extends HTMLElement>(selector: string, parent: ParentNode = document): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error('Missing document control: ' + selector);
  return element;
}
export function mountDocuments({ writer, onSelect, onNameChange = () => {}, onRecovery = onSelect, onStorageReady = () => {}, compositionPending, fixture, expectBridge }: Options) {
  const dialog = required<HTMLDialogElement>('#documents');
  const trigger = required<HTMLButtonElement>('.clip-trigger');
  const tree = required<HTMLElement>('.document-tree', dialog);
  const feedback = required<HTMLElement>('.document-feedback', dialog);
  const recoveryControls = required<HTMLElement>('.document-recovery', dialog);
  const copyPicker = required<HTMLSelectElement>('select', recoveryControls);
  const newDocument = required<HTMLButtonElement>('#new-document', dialog);
  const newFolder = required<HTMLButtonElement>('#new-folder', dialog);
  const warning = required<HTMLElement>('#save-error');
  const form = required<HTMLFormElement>('.document-form', dialog);
  const heading = required<HTMLElement>('h2', form);
  const nameInput = required<HTMLInputElement>('input', form);
  const folderPicker = required<HTMLSelectElement>('select', form);
  const confirm = required<HTMLButtonElement>('[type="submit"]', form);
  const detail = required<HTMLElement>('.document-detail', form);
  const storage = documentStorage({ storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  }, fixture, notify: message => {
    warning.textContent = message;
    warning.hidden = !message;
    if (dialog.open) feedback.textContent = message;
  } });
  let loading = Boolean(expectBridge);
  let browserChanged = false;
  let library = loading ? storage.loadCache(writer().value) : storage.loadBrowser(writer().value);
  let destination: string | null = null;
  let action: { type: FormType; id?: string } | undefined;
  let edited: string | null = null;
  let confirmDraftCopy = false;
  let nameComposing = false;
  let copies: { even: Library; device: Library } | undefined;

  function active(): DocumentFile {
    const file = library.files.find(item => item.id === library.active);
    if (!file) throw new Error('Active document missing');
    return file;
  }

  function apply(change: Action) {
    if (change.type === 'save') {
      if (copies) return false;
      browserChanged = true;
    }
    if (loading && change.type !== 'save') {
      feedback.textContent = 'Waiting for Even App documents.';
      return false;
    }
    try {
      const next = updateLibrary(library, change);
      const readOnlyNavigation = !storage.writable() && ['select', 'toggle'].includes(change.type);
      if (next !== library && !readOnlyNavigation && (loading || !storage.save(next))) {
        if (change.type === 'save') library = next;
        return false;
      }
      const switched = library.active !== next.active;
      const previousName = active()?.name;
      if (next !== library && !readOnlyNavigation) browserChanged = true;
      library = next;
      if (switched) {
        destination = active().folder;
        onSelect(active());
      } else if (active()?.name !== previousName) onNameChange(active());
      return true;
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : 'Document operation failed.';
      return false;
    }
  }

  function compositionReady() {
    if (!compositionPending()) return true;
    feedback.textContent = 'Finish typing in the editor before switching or deleting documents.';
    return false;
  }

  function close() {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    dialog.classList.add('closing');
    const finish = () => {
      if (dialog.classList.contains('closing')) dialog.close();
    };
    window.setTimeout(finish, 240);
  }

  function row(label: string, kind: string, onClick: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-row ' + kind;
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = label;
    button.append(icon, name);
    button.onclick = onClick;
    return button;
  }

  function actions(item: Folder | DocumentFile, kind: 'file' | 'folder') {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-actions';
    const options = {
      Rename: () => showForm(kind === 'file' ? 'rename-file' : 'rename-folder', item),
      ...(kind === 'file' ? { Move: () => showForm('move-file', item) } : {}),
      Delete: () => showForm(kind === 'file' ? 'delete-file' : 'delete-folder', item),
    };
    for (const [label, open] of Object.entries(options)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', label + ' ' + item.name);
      button.onclick = open;
      wrapper.append(button);
    }
    return wrapper;
  }

  function itemRow(item: Folder | DocumentFile, kind: 'file' | 'folder', button: HTMLButtonElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-entry';
    wrapper.dataset.id = item.id;
    wrapper.append(button);
    if (loading || !storage.writable()) return wrapper;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tree-more';
    more.textContent = '⋯';
    more.setAttribute('aria-label', 'Actions for ' + item.name);
    more.setAttribute('aria-expanded', String(edited === item.id));
    more.onclick = () => {
      edited = edited === item.id ? null : item.id;
      render().get(item.id)?.querySelector<HTMLButtonElement>('.tree-more')?.focus({ preventScroll: true });
    };
    wrapper.append(more);
    if (edited === item.id) wrapper.append(actions(item, kind));
    return wrapper;
  }

  function render() {
    tree.replaceChildren();
    const entries = new Map<string, HTMLElement>();
    function append(parent: HTMLElement, item: Folder | DocumentFile, kind: 'file' | 'folder', button: HTMLButtonElement) {
      const entry = itemRow(item, kind, button);
      entries.set(item.id, entry);
      parent.append(entry);
    }
    function appendFile(parent: HTMLElement, file: DocumentFile) {
      const button = row(file.name, 'file', () => {
        if (file.id === library.active || (compositionReady() && apply({ type: 'select', id: file.id }))) close();
      });
      if (file.id === library.active) button.setAttribute('aria-current', 'page');
      append(parent, file, 'file', button);
    }
    for (const folder of library.folders) {
      const branch = document.createElement('div');
      branch.className = 'folder-branch';
      const clip = document.createElement('div');
      const children = document.createElement('div');
      children.className = 'folder-files';
      library.files.filter(file => file.folder === folder.id).forEach(file => appendFile(children, file));
      clip.append(children);
      branch.append(clip);

      const button = row(folder.name, 'folder', () => {
        if (!apply({ type: 'toggle', id: folder.id })) return;
        const expanded = updateBranch();
        destination = expanded ? folder.id : null;
        renderDestination();
      });
      function updateBranch() {
        const expanded = library.expanded.includes(folder.id);
        button.setAttribute('aria-expanded', String(expanded));
        branch.inert = !expanded;
        return expanded;
      }
      updateBranch();
      append(tree, folder, 'folder', button);
      tree.append(branch);
    }
    library.files.filter(file => file.folder === null).forEach(file => appendFile(tree, file));
    const readOnly = loading || !storage.writable();
    newDocument.disabled = readOnly;
    newFolder.disabled = readOnly;
    recoveryControls.hidden = !copies;
    renderDestination();
    return entries;
  }

  function renderDestination() {
    const folder = library.folders.find(item => item.id === destination);
    newDocument.title = folder ? 'New document in ' + folder.name : 'New document in root';
    required<HTMLElement>('.document-location', dialog).textContent = !newDocument.disabled && folder ? 'New documents go in ' + folder.name : '';
  }

  function showForm(type: FormType, item?: Folder | DocumentFile) {
    if (loading || !storage.writable()) return;
    action = { type, id: item?.id };
    nameComposing = false;
    const renaming = type.startsWith('rename');
    const deleting = type.startsWith('delete');
    const moving = type === 'move-file';
    nameInput.hidden = !renaming && type !== 'new-folder';
    nameInput.disabled = nameInput.hidden;
    nameInput.value = renaming ? item?.name ?? '' : '';
    folderPicker.hidden = !moving;
    folderPicker.disabled = !moving;
    if (moving) {
      folderPicker.replaceChildren(new Option('Root', ''), ...library.folders.map(folder => new Option(folder.name, folder.id)));
      folderPicker.value = item && 'folder' in item ? item.folder ?? '' : '';
    }
    heading.textContent = type === 'new-folder' ? 'New folder'
      : (renaming ? 'Rename ' : deleting ? 'Delete ' : 'Move ') + (item?.name ?? '');
    detail.textContent = type === 'delete-folder'
      ? 'Documents in this folder will move to Root. Any matching names will receive a numeric suffix.'
      : deleting ? 'This permanently deletes the document from this library.' : '';
    confirm.textContent = deleting ? 'Delete' : moving ? 'Move' : renaming ? 'Rename' : 'Create';
    form.hidden = false;
    tree.hidden = true;
    required<HTMLElement>('.sheet-actions', dialog).hidden = true;
    required<HTMLElement>('.document-location', dialog).hidden = true;
    feedback.textContent = '';
    if (!nameInput.hidden) nameInput.select();
    (!nameInput.hidden ? nameInput : moving ? folderPicker : required<HTMLButtonElement>('.cancel-action', form)).focus();
  }

  function hideForm(restoreFocus = false) {
    const previous = action;
    action = undefined;
    form.hidden = true;
    tree.hidden = false;
    required<HTMLElement>('.sheet-actions', dialog).hidden = false;
    required<HTMLElement>('.document-location', dialog).hidden = false;
    const entries = render();
    if (restoreFocus && previous) {
      ((previous.id ? entries.get(previous.id)?.querySelector<HTMLButtonElement>('.tree-more') : undefined) ?? required<HTMLButtonElement>('#new-folder', dialog)).focus();
    }
  }

  required<HTMLButtonElement>('.cancel-action', form).onclick = () => {
    feedback.textContent = '';
    hideForm(true);
  };
  nameInput.addEventListener('compositionstart', () => { nameComposing = true; });
  nameInput.addEventListener('compositionend', () => { nameComposing = false; });
  form.onsubmit = event => {
    event.preventDefault();
    if (nameComposing || !action) return;
    if (action.type.startsWith('delete') && !compositionReady()) return;
    const { type, id } = action;
    let change: Action;
    if (type === 'new-folder') change = { type, name: nameInput.value };
    else {
      if (!id) return;
      if (type === 'rename-file' || type === 'rename-folder') change = { type, id, name: nameInput.value };
      else if (type === 'move-file') change = { type, id, folder: folderPicker.value || null };
      else change = { type, id };
    }
    if (!apply(change)) return;
    if (type === 'delete-folder' && destination === id) destination = null;
    feedback.textContent = '';
    hideForm(true);
  };
  trigger.onclick = () => {
    if (dialog.open) return;
    confirmDraftCopy = false;
    edited = null;
    writer().blur();
    destination = active().folder;
    feedback.textContent = loading ? 'Waiting for Even App documents.' : warning.textContent;
    hideForm();
    dialog.showModal();
  };
  required<HTMLButtonElement>('.sheet-close', dialog).onclick = close;
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (action) hideForm(true);
    else close();
  });
  dialog.addEventListener('animationend', event => {
    if (event.target === dialog && event.animationName === 'documents-out') dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.classList.remove('closing');
    if (!document.querySelector<HTMLDialogElement>('#codex-dialog')?.open && !document.querySelector<HTMLDialogElement>('#x-dialog')?.open) writer().focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && event.clientY < dialog.getBoundingClientRect().top) close();
  });
  copyPicker.onchange = () => {
    if (!copies) return;
    library = copyPicker.value === 'device' ? copies.device : copies.even;
    destination = active().folder;
    onSelect(active());
    feedback.textContent = warning.textContent;
    render();
  };
  newFolder.onclick = () => showForm('new-folder');
  newDocument.onclick = () => {
    if (compositionReady() && apply({ type: 'new-file', folder: destination })) close();
  };
  required<HTMLButtonElement>('#copy-document', dialog).onclick = async () => {
    if (compositionPending() && !confirmDraftCopy) {
      confirmDraftCopy = true;
      feedback.textContent = 'Composition is pending. Tap Copy text again to copy the current draft.';
      return;
    }
    confirmDraftCopy = false;
    const text = active().text;
    try {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const buffer = document.createElement('textarea');
        buffer.value = text;
        buffer.setAttribute('readonly', '');
        dialog.append(buffer);
        try {
          buffer.focus({ preventScroll: true });
          buffer.select();
          buffer.setSelectionRange(0, text.length);
          if (!document.execCommand('copy')) throw Error('Copy unavailable');
        } finally {
          buffer.remove();
          required<HTMLButtonElement>('#copy-document', dialog).focus({ preventScroll: true });
        }
      }
      feedback.textContent = 'Copied.';
    } catch { feedback.textContent = 'Copy failed. Check clipboard access and try again.'; }
  };
  return {
    current: active,
    canEdit: () => !loading && storage.writable(),
    save(id: string, text: string) { apply({ type: 'save', id, text }); },
    async connect(bridge: HostStorage) {
      if (fixture) return;
      loading = true;
      writer().readOnly = true;
      const recovered = await storage.loadEven(bridge, () => library, () => browserChanged || compositionPending());
      loading = false;
      onStorageReady();
      const deviceCopy = storage.recoveryCopy();
      if (deviceCopy && recovered) {
        copies = { even: recovered, device: deviceCopy };
        copyPicker.value = 'even';
      }
      if (recovered && recovered !== library) {
        library = recovered;
        destination = active().folder;
        onRecovery(active());
      }
      if (dialog.open) hideForm();
    },
  };
}
