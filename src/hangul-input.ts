const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const vowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const finals = 'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const combined: Readonly<Record<string, string>> = {
  ㄲ: 'ㄱㄱ', ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄸ: 'ㄷㄷ',
  ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅃ: 'ㅂㅂ', ㅄ: 'ㅂㅅ', ㅆ: 'ㅅㅅ', ㅉ: 'ㅈㅈ',
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
};

function parts(text: string) {
  let sequence = '';
  for (const character of text.normalize('NFKD')) {
    const code = character.charCodeAt(0);
    const part = initials[code - 0x1100] ?? vowels[code - 0x1161] ?? finals[code - 0x11a8];
    if (!part) return '';
    sequence += combined[part] ?? part;
  }
  return sequence;
}

export function removedHangul(before: string, after: string, caret: number) {
  if (before.length !== after.length + 1) return undefined;
  let index = caret;
  if (!Number.isInteger(index) || before.slice(0, index) + before.slice(index + 1) !== after) {
    index = 0;
    while (index < after.length && before[index] === after[index]) index++;
  }
  const sequence = parts(before[index]);
  if (sequence && before.slice(index + 1) === after.slice(index)) {
    return { index, sequence };
  }
}

export function hangulReplacement(deletion: { index: number; sequence: string }, before: string, after: string) {
  const { index, sequence } = deletion;
  const prefix = before.slice(0, index);
  const suffix = before.slice(index);
  if (after.length <= before.length || !after.startsWith(prefix) || !after.endsWith(suffix)) return;
  const next = parts(after.slice(index, after.length - suffix.length));
  if (!next) return;
  if (next.length === sequence.length + 1 && next.startsWith(sequence)) return 'strike';
  if (sequence.length === next.length + 1 && sequence.startsWith(next)) return 'erase';
}
