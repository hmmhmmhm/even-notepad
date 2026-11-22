import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLibrary, readLibrary, updateLibrary } from '../src/document-library.ts';

const legacy = JSON.stringify({
  active: '한글.md', expanded: ['Notes'], files: [
    { name: '한글.md', folder: 'Notes', text: '가나다\n완성된 글' },
    { name: '같은 이름.md', folder: 'Notes', text: '폴더 내용' },
    { name: '같은 이름.md', folder: '', text: '루트 내용' },
  ],
});

test('migration preserves active text, location, names, and separate identities across a restart', () => {
  const original = migrateLibrary(legacy);
  const reopened = readLibrary(JSON.stringify(original));
  assert.deepEqual(reopened, original);
  const file = reopened.files.find(item => item.id === reopened.active);
  assert.equal(file.text, '가나다\n완성된 글');
  assert.equal(reopened.folders.find(folder => folder.id === file.folder).name, 'Notes');
  assert.notEqual(reopened.files[1].id, reopened.files[2].id);
  assert.throws(() => migrateLibrary('{"files":[]}'));
});

test('new, rename, and move keep text at the same identity and reject destination collisions', () => {
  let library = migrateLibrary(legacy);
  const file = library.files.find(item => item.id === library.active);
  library = updateLibrary(library, { type: 'new-folder', name: '  새 폴더  ' });
  const folder = library.folders.at(-1);
  assert.equal(folder.name, '새 폴더');
  library = updateLibrary(library, { type: 'rename-folder', id: folder.id, name: '작업' });
  library = updateLibrary(library, { type: 'rename-file', id: file.id, name: '제목.md' });
  library = updateLibrary(library, { type: 'move-file', id: file.id, folder: folder.id });
  library = updateLibrary(library, { type: 'save', id: file.id, text: '뒤늦은 한글' });
  library = updateLibrary(library, { type: 'move-file', id: file.id, folder: null });
  assert.deepEqual(library.files.find(item => item.id === file.id), {
    id: file.id, name: '제목.md', text: '뒤늦은 한글', folder: null,
  });
  assert.throws(() => updateLibrary(library, { type: 'rename-file', id: file.id, name: '같은 이름.md' }), /already in use/);
  assert.throws(() => updateLibrary(library, { type: 'move-file', id: library.files[1].id, folder: null }), /already in use/);
  library = updateLibrary(library, { type: 'new-file', folder: null });
  assert.equal(library.files.find(item => item.id === library.active).name, 'UNTITLED.md');
  library = updateLibrary(library, { type: 'new-file', folder: null });
  assert.equal(library.files.find(item => item.id === library.active).name, 'UNTITLED-2.md');
});

test('deleting a folder preserves both colliding documents; a late edit cannot resurrect a deleted file', () => {
  const original = migrateLibrary(legacy);
  const removedFolder = original.folders.find(folder => folder.name === 'Notes');
  let library = updateLibrary(original, { type: 'delete-folder', id: removedFolder.id });
  assert.equal(library.active, original.active);
  assert.ok(library.files.every(file => file.folder === null));
  assert.equal(library.files.find(file => file.name === '같은 이름.md').text, '루트 내용');
  assert.equal(library.files.find(file => file.name === '같은 이름-2.md').text, '폴더 내용');
  for (const file of original.files) library = updateLibrary(library, { type: 'delete-file', id: file.id });
  assert.equal(library.files.length, 1);
  assert.equal(library.files[0].text, '');
  assert.equal(updateLibrary(library, { type: 'save', id: original.active, text: 'late' }), library);
});
