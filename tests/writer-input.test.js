import assert from 'node:assert/strict';
import test from 'node:test';
import { watchWriterInput } from '../src/writer-input.ts';

function writer(initial = '') {
  const input = Object.assign(new EventTarget(), { value: initial, selectionStart: 0, selectionEnd: initial.length });
  const texts = [];
  const edits = [];
  const composing = watchWriterInput(input, value => texts.push(value), (...command) => edits.push(command));
  const dispatch = (type, properties) => input.dispatchEvent(Object.assign(new Event(type), properties));
  function write(value, inputType, data, isComposing = false) {
    input.value = value;
    dispatch('input', { inputType, data, isComposing });
  }
  return { input, texts, edits, dispatch, write, composing };
}

test('three composition events strike even if textarea is unchanged until a different final commit', () => {
  const { texts, edits, dispatch, write } = writer();
  dispatch('compositionstart');
  for (const data of ['ㄱ', '가', '갛']) {
    dispatch('keydown', { key: 'Process' });
    dispatch('compositionupdate', { data });
    dispatch('beforeinput', { data, inputType: 'insertCompositionText' });
    dispatch('input', { data, inputType: 'insertCompositionText', isComposing: true });
  }
  dispatch('compositionend', { data: '강' });
  write('강', 'insertText', '강');
  assert.deepEqual(texts, ['ㄱ', '가', '갛', '강']);
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('native composition input followed by compositionupdate is counted once per change', () => {
  const { texts, edits, dispatch, write } = writer();
  dispatch('compositionstart');
  for (const data of ['ㄱ', '가', '강']) {
    write(data, 'insertCompositionText', data, true);
    dispatch('compositionupdate', { data });
  }
  write('강', 'insertFromComposition', '강');
  dispatch('compositionend', { data: '강' });
  assert.deepEqual(texts, ['ㄱ', '가', '강']);
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('an empty compositionend does not rewind strikes on a late native commit', () => {
  const { texts, edits, dispatch, write } = writer();
  dispatch('compositionstart');
  for (const data of ['ㄱ', '가', '강']) dispatch('compositionupdate', { data });
  dispatch('compositionend', { data: '' });
  write('강', 'insertFromComposition', '강');
  assert.equal(texts.at(-1), '강');
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('an explicit rollback returns the original text and cancels only the active composition strikes', () => {
  const { texts, edits, dispatch, write } = writer('원');
  dispatch('compositionstart');
  dispatch('compositionupdate', { data: 'ㄱ' });
  write('ㄱ', 'insertCompositionText', 'ㄱ', true);
  dispatch('compositionupdate', { data: '가' });
  write('가', 'insertCompositionText', '가', true);
  dispatch('compositionend', { data: '' });
  write('원', 'deleteCompositionText');
  assert.equal(texts.at(-1), '원');
  assert.deepEqual(edits, [['strike'], ['strike'], ['cancel', 2]]);
});

test('Enter and Backspace each send one mechanical action and contents stay in the text stream', () => {
  const { texts, edits, write } = writer();
  write('Z', 'insertText', 'Z');
  write('Z\n', 'insertLineBreak');
  write('Z\na\nB', 'insertFromPaste');
  write('Z', 'deleteContentBackward');
  assert.deepEqual(texts, ['Z', 'Z\n', 'Z\na\nB', 'Z']);
  assert.deepEqual(edits, [['strike'], ['enter'], ['strike'], ['erase']]);
});

test('typed native-only composition drafts work without keyboard or composition events', () => {
  const { texts, edits, write } = writer();
  for (const data of ['ㄱ', '가', '강']) {
    write(data, 'insertCompositionText', data, true);
    write(data, 'insertCompositionText', data, true);
  }
  write('강', 'insertFromComposition', '강');
  assert.deepEqual(texts, ['ㄱ', '가', '강']);
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('the native text wins when an IME adjusts surrounding text outside its original selection', () => {
  const { texts, edits, dispatch, write } = writer();
  dispatch('compositionstart');
  write('가와', 'insertCompositionText', '와', true);
  dispatch('compositionupdate', { data: '와' });
  dispatch('compositionend', { data: '와' });
  assert.equal(texts.at(-1), '가와');
  assert.deepEqual(edits, [['strike']]);
});

test('iPhone backward-delete and insert pairs extend Hangul without erasing decorative ink', () => {
  const { texts, edits, dispatch, write } = writer();
  write('ㄱ', 'insertText', 'ㄱ');
  for (const data of ['가', '강']) {
    write('', 'deleteContentBackward', null);
    dispatch('beforeinput', { inputType: 'insertText', data, isComposing: false });
    write(data, 'insertText', data);
  }
  assert.deepEqual(texts, ['ㄱ', '', '가', '', '강']);
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('an unpaired software Backspace still erases one mark', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { texts, edits, write } = writer('강');
  write('', 'deleteContentBackward', null);
  assert.deepEqual(texts, ['']);
  assert.deepEqual(edits, []);
  t.mock.timers.runAll();
  assert.deepEqual(edits, [['erase']]);
});

test('a backward Hangul replacement erases once and the real text follows the new syllable', () => {
  const { texts, edits, write } = writer('강');
  write('', 'deleteContentBackward', null);
  write('가', 'insertText', '가');
  assert.deepEqual(texts, ['', '가']);
  assert.deepEqual(edits, [['erase']]);
});

test('a compound vowel and final consonant transfer both add exactly one mark', () => {
  const { texts, edits, dispatch, write } = writer('고');
  write('', 'deleteContentBackward', null);
  write('과', 'insertText', '과');
  write('각', 'insertText', '각');
  write('', 'deleteContentBackward', null);
  dispatch('beforeinput', { inputType: 'insertText', data: '가가' });
  write('가가', 'insertText', '가가');
  assert.equal(texts.at(-1), '가가');
  assert.deepEqual(edits, [['strike'], ['strike'], ['strike']]);
});

test('ordinary deletion stays separate from a fast Latin, unrelated Korean, paste, or newline edit', () => {
  for (const [value, type, expected] of [
    ['x', 'insertText', 'strike'],
    ['나', 'insertText', 'strike'],
    ['강', 'insertFromPaste', 'strike'],
    ['\n', 'insertLineBreak', 'enter'],
  ]) {
    const { edits, write } = writer('가');
    write('', 'deleteContentBackward', null);
    write(value, type, value);
    assert.deepEqual(edits, [['erase'], [expected]]);
  }
});

test('an explicit Backspace stays separate even when the next key resembles Korean composition', () => {
  const { dispatch, edits, write } = writer('가');
  dispatch('keydown', { key: 'Backspace' });
  write('', 'deleteContentBackward', null);
  assert.deepEqual(edits, [['erase']]);
  dispatch('keyup', { key: 'Backspace' });
  write('강', 'insertText', '강');
  assert.deepEqual(edits, [['erase'], ['strike']]);
});

test('matching edits use the actual caret and preserve text on both sides', () => {
  const { input, edits, texts, write } = writer('가가 끝');
  input.selectionStart = 0;
  write('가 끝', 'deleteContentBackward', null);
  write('강가 끝', 'insertText', '강');
  assert.deepEqual(texts, ['가 끝', '강가 끝']);
  assert.deepEqual(edits, [['strike']]);
});

test('a 105ms Hangul replacement can pair, but a late replacement remains separate', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);

  const paired = writer('가');
  paired.write('', 'deleteContentBackward', null);
  t.mock.timers.tick(105);
  elapsed = 105;
  paired.write('강', 'insertText', '강');
  assert.deepEqual(paired.edits, [['strike']]);

  const separate = writer('가');
  separate.write('', 'deleteContentBackward', null);
  t.mock.timers.tick(130);
  elapsed += 130;
  separate.write('강', 'insertText', '강');
  assert.deepEqual(separate.edits, [['erase'], ['strike']]);
});

test('a late native commit remains with the composing editor after a new document receives input', () => {
  const first = writer('first ');
  first.input.selectionStart = first.input.selectionEnd = 6;
  first.dispatch('compositionstart');
  first.dispatch('compositionupdate', { data: '하' });
  first.dispatch('blur');
  assert.equal(first.composing(), true);

  const second = writer();
  second.write('second', 'insertText', 'second');
  first.write('first 한', 'insertFromComposition', '한');
  first.dispatch('compositionend', { data: '한' });

  assert.equal(first.composing(), false);
  assert.equal(first.texts.at(-1), 'first 한');
  assert.deepEqual(second.texts, ['second']);
  assert.deepEqual(second.edits, [['strike']]);
});

test('cancelling composition without a subsequent input permits copying the restored native value', () => {
  const first = writer('원');
  first.dispatch('compositionstart');
  first.dispatch('compositionupdate', { data: '가' });
  first.dispatch('compositionend', { data: '' });
  assert.equal(first.composing(), false);
  assert.equal(first.texts.at(-1), '원');
});

test('marks composition updates and a plain-text commit as belonging to the composition', () => {
  const input = Object.assign(new EventTarget(), { value: '', selectionStart: 0, selectionEnd: 0 });
  const seen=[]; watchWriterInput(input,(text, composing)=>seen.push({text,composing}),()=>{});
  input.dispatchEvent(new Event('compositionstart'));
  input.dispatchEvent(Object.assign(new Event('compositionupdate'),{data:'가'}));
  input.value='강'; input.dispatchEvent(Object.assign(new Event('input'),{inputType:'insertText',data:'강',isComposing:false}));
  assert.deepEqual(seen,[{text:'가',composing:true},{text:'강',composing:true}]);
});

test('marks native-only IME commits even when a composition start is absent', () => {
  const input=Object.assign(new EventTarget(),{value:'',selectionStart:0,selectionEnd:0});
  const seen=[]; watchWriterInput(input,(text,composing)=>seen.push({text,composing}),()=>{});
  input.value='가'; input.dispatchEvent(Object.assign(new Event('input'),{inputType:'insertCompositionText',data:'가',isComposing:true}));
  input.value='강'; input.dispatchEvent(Object.assign(new Event('input'),{inputType:'insertText',data:'강',isComposing:false}));
  input.value='강!'; input.dispatchEvent(Object.assign(new Event('input'),{inputType:'insertText',data:'!',isComposing:false}));
  assert.deepEqual(seen,[{text:'가',composing:true},{text:'강',composing:true},{text:'강!',composing:false}]);
});

test('ambiguous composition end remains pending for terminal navigation and marks late commit', () => {
  const input=Object.assign(new EventTarget(),{value:'',selectionStart:0,selectionEnd:0});
  const seen=[]; const pending=watchWriterInput(input,(text,composing)=>seen.push({text,composing}),()=>{});
  input.dispatchEvent(new Event('compositionstart'));
  input.dispatchEvent(Object.assign(new Event('compositionupdate'),{data:'가'}));
  input.dispatchEvent(Object.assign(new Event('compositionend'),{data:''}));
  assert.equal(pending(),false); assert.equal(pending(true),true);
  input.value='강'; input.dispatchEvent(Object.assign(new Event('input'),{inputType:'insertText',data:'강',isComposing:false}));
  assert.equal(seen.at(-1).text,'강'); assert.equal(seen.at(-1).composing,true); assert.equal(pending(true),false);
});
