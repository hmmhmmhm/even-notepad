export type Folder = { id: string; name: string };
export type DocumentFile = { id: string; name: string; text: string; folder: string | null };
export type Library = { version: 2; folders: Folder[]; files: DocumentFile[]; active: string; expanded: string[] };
type Named = { id: string; name: string };
export type Action =
  | { type: 'select' | 'toggle' | 'delete-file' | 'delete-folder'; id: string }
  | { type: 'save'; id: string; text: string }
  | { type: 'new-file'; folder: string | null }
  | { type: 'new-folder'; name: string }
  | { type: 'rename-folder' | 'rename-file'; id: string; name: string }
  | { type: 'move-file'; id: string; folder: string | null };
const starterFolders = ['Notes', 'Archive'];
const createId = () => globalThis.crypto?.randomUUID?.()
  ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
function unique<T>(values: T[]) { return new Set(values).size === values.length; }
function nameKey(name: string) { return name.normalize('NFC').toLowerCase(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isFolder(value: unknown): value is Folder {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && !!value.name;
}
function isFile(value: unknown): value is DocumentFile {
  return isFolder(value) && 'text' in value && typeof value.text === 'string' && 'folder' in value && (value.folder === null || typeof value.folder === 'string');
}
function isLibrary(value: unknown): value is Library {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.folders) || !value.folders.every(isFolder)
    || !Array.isArray(value.files) || !value.files.every(isFile) || !Array.isArray(value.expanded)
    || typeof value.active !== 'string') return false;
  const folders = value.folders;
  return value.files.every(file => file.folder === null || folders.some(folder => folder.id === file.folder))
    && unique([...value.files, ...folders].map(item => item.id))
    && value.expanded.every(id => typeof id === 'string' && folders.some(folder => folder.id === id))
    && value.files.some(file => file.id === value.active);
}
export function readLibrary(raw: string): Library {
  const library: unknown = JSON.parse(raw);
  if (!isLibrary(library)) throw Error('Invalid document library');
  return library;
}
type LegacyFile = { name: string; folder: string; text: string };
type Legacy = { active: string; expanded: unknown[]; files: LegacyFile[] };
function isLegacy(value: unknown): value is Legacy {
  return isRecord(value) && typeof value.active === 'string' && Array.isArray(value.expanded)
    && Array.isArray(value.files)
    && value.files.every(file => isRecord(file) && typeof file.name === 'string' && !!file.name
      && typeof file.text === 'string' && typeof file.folder === 'string' && ['', ...starterFolders].includes(file.folder))
    && value.files.some(file => file.name === value.active);
}
export function migrateLibrary(raw: string | null, initialText = ''): Library {
  const previous: unknown = raw === null ? {
    active: 'UNTITLED.md', expanded: starterFolders,
    files: [
      { name: 'Ideas.md', folder: 'Notes', text: '' },
      { name: 'Meeting.md', folder: 'Notes', text: '' },
      { name: 'Old.md', folder: 'Archive', text: '' },
      { name: 'UNTITLED.md', folder: '', text: initialText },
    ],
  } : JSON.parse(raw);
  if (!isLegacy(previous)) throw Error('Invalid legacy document library');
  const folders = starterFolders.map(name => ({ id: createId(), name }));
  const files = previous.files.map(file => ({
    ...file, id: createId(), folder: folders.find(folder => folder.name === file.folder)?.id ?? null,
  }));
  const active = files.find(file => file.name === previous.active);
  if (!active) throw Error('Invalid legacy document library');
  return {
    version: 2, folders, files, active: active.id,
    expanded: folders.filter(folder => previous.expanded.includes(folder.name)).map(folder => folder.id),
  };
}

function validName(name: string) {
  const normalized = name.trim().normalize('NFC');
  if (!normalized || normalized === '.' || normalized === '..' || /[\u0000-\u001f\u007f/\\]/u.test(normalized)) {
    throw Error('Enter a name without slashes or control characters.');
  }
  return normalized;
}

function checkName(items: readonly Named[], name: string, id?: string) {
  if (items.some(item => item.id !== id && nameKey(item.name) === nameKey(name))) {
    throw Error('That name is already in use here.');
  }
}

function availableName(files: readonly DocumentFile[], folder: string | null, preferred: string) {
  const names = new Set(files.filter(file => file.folder === folder).map(file => nameKey(file.name)));
  const extension = preferred.lastIndexOf('.');
  const stem = extension > 0 ? preferred.slice(0, extension) : preferred;
  const suffix = extension > 0 ? preferred.slice(extension) : '';
  let name = preferred;
  for (let index = 2; names.has(nameKey(name)); index++) name = stem + '-' + index + suffix;
  return name;
}

export function updateLibrary(library: Library, action: Action): Library {
  const id = 'id' in action ? action.id : '';
  const name = 'name' in action ? action.name : '';
  const folder = 'folder' in action ? action.folder : null;
  const text = 'text' in action ? action.text : '';
  const file = library.files.find(item => item.id === id);
  const expand = (destination: string | null) => destination === null || library.expanded.includes(destination)
    ? library.expanded : [...library.expanded, destination];
  const changeFile = (changes: Partial<DocumentFile>) => library.files.map(item => item.id === id ? { ...item, ...changes } : item);
  switch (action.type) {
    case 'select':
      return file && id !== library.active ? { ...library, active: id } : library;
    case 'save':
      return file && file.text !== text ? { ...library, files: changeFile({ text }) } : library;
    case 'toggle':
      return { ...library, expanded: library.expanded.includes(id) ? library.expanded.filter(item => item !== id) : expand(id) };
    case 'new-file': {
      const next = { id: createId(), name: availableName(library.files, folder, 'UNTITLED.md'), folder, text: '' };
      return { ...library, files: [...library.files, next], active: next.id, expanded: expand(folder) };
    }
    case 'new-folder': {
      const next = { id: createId(), name: validName(name) };
      checkName(library.folders, next.name);
      return { ...library, folders: [...library.folders, next], expanded: expand(next.id) };
    }
    case 'rename-folder': {
      const nextName = validName(name);
      checkName(library.folders, nextName, id);
      return { ...library, folders: library.folders.map(item => item.id === id ? { ...item, name: nextName } : item) };
    }
    case 'rename-file': {
      if (!file) throw Error('Document not found');
      const nextName = validName(name);
      checkName(library.files.filter(item => item.folder === file.folder), nextName, id);
      return { ...library, files: changeFile({ name: nextName }) };
    }
    case 'move-file':
      if (!file) throw Error('Document not found');
      checkName(library.files.filter(item => item.folder === folder), file.name, id);
      return { ...library, files: changeFile({ folder }), expanded: expand(folder) };
    case 'delete-file': {
      let files = library.files.filter(item => item.id !== id);
      if (!files.length) files = [{ id: createId(), name: 'UNTITLED.md', folder: null, text: '' }];
      return { ...library, files, active: library.active === id ? files[0].id : library.active };
    }
    case 'delete-folder': {
      const files = library.files.filter(item => item.folder !== id);
      for (const item of library.files.filter(candidate => candidate.folder === id)) {
        files.push({ ...item, name: availableName(files, null, item.name), folder: null });
      }
      return { ...library, files, folders: library.folders.filter(item => item.id !== id),
        expanded: library.expanded.filter(item => item !== id) };
    }
  }
  throw Error('Unknown document action');
}
