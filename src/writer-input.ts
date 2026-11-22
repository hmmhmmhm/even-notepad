import { hangulReplacement, removedHangul } from './hangul-input.ts';

const hangulReplacementWindow = 120;

type Action = 'strike' | 'erase' | 'enter' | 'cancel';
type Composition = { before: string; after: string; original: string; strikes: number; data?: string; draftBase?: string };
type Ended = { cancelled?: boolean; original?: string; strikes?: number; value?: string };
type PendingDelete = { index: number; sequence: string; deadline: number; timer: ReturnType<typeof setTimeout> };
export function watchWriterInput(input: HTMLTextAreaElement, onText: (value: string, compositionRelated: boolean) => void, onEdit: (action: Action, count?: number) => void) {
  let previous = input.value;
  let composition: Composition | undefined;
  let ended: Ended | undefined;
  let nativeDraft: string | undefined;
  let pendingDelete: PendingDelete | undefined;
  let backspaceKey = false;

  function publish(value: string, compositionRelated = false) {
    if (value === previous) return;
    previous = value;
    onText(value, compositionRelated);
  }

  function draft(data: string, value: string) {
    if (!composition) return;
    if (data && data !== composition.data) {
      composition.strikes++;
      onEdit('strike');
    }
    composition.data = data;
    publish(value, true);
  }

  function finishDelete(action: Action = 'erase') {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    pendingDelete = undefined;
    onEdit(action);
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Backspace') {
      finishDelete();
      backspaceKey = true;
    }
  });
  input.addEventListener('keyup', event => {
    if (event.key === 'Backspace') backspaceKey = false;
  });
  input.addEventListener('blur', () => {
    finishDelete();
    backspaceKey = false;
  });

  input.addEventListener('compositionstart', () => {
    finishDelete();
    ended = undefined;
    nativeDraft = undefined;
    composition = {
      before: input.value.slice(0, input.selectionStart),
      after: input.value.slice(input.selectionEnd),
      original: input.value,
      strikes: 0,
    };
  });

  input.addEventListener('compositionupdate', event => {
    if (!composition || event.data === composition.data) return;
    composition.draftBase = input.value;
    draft(event.data, composition.before + event.data + composition.after);
  });

  input.addEventListener('input', event => {
    const value = input.value;
    const type = 'inputType' in event && typeof event.inputType === 'string' ? event.inputType : '';
    const isComposing = 'isComposing' in event && event.isComposing === true;
    const data = 'data' in event && typeof event.data === 'string' ? event.data : null;
    const compositionRelated = Boolean(composition || nativeDraft !== undefined || ended?.cancelled || isComposing || type.includes('Composition'));
    const changed = value !== previous;
    const explicitBackspace = backspaceKey;
    backspaceKey = false;

    if (pendingDelete) {
      const action = type === 'insertText' && performance.now() <= pendingDelete.deadline
        && hangulReplacement(pendingDelete, previous, value);
      finishDelete(action || 'erase');
      if (action) {
        publish(value, compositionRelated);
        return;
      }
    }
    if (ended) {
      const ending = ended;
      ended = undefined;
      if (ending.cancelled && value === ending.original && type === 'deleteCompositionText') {
        onEdit('cancel', ending.strikes);
        publish(value, compositionRelated);
        return;
      }
      if (type === 'insertFromComposition' || (!ending.cancelled && value === ending.value)) {
        publish(value, compositionRelated);
        return;
      }
    }
    if (composition) {
      if (type.startsWith('delete')) {
        publish(value, compositionRelated);
      } else if (type === 'insertFromComposition' || (type === 'insertText' && ('isComposing' in event && event.isComposing === false))) {
        publish(value, compositionRelated);
      } else if (typeof data === 'string') {
        // Match the native echo against the draft, even when textarea.value still lags.
        if (data !== composition.data) {
          draft(data, composition.before + data + composition.after);
        }
        if (value !== composition.original && value !== composition.draftBase) publish(value, compositionRelated);
      } else if (changed) {
        draft(value, value);
      }
      return;
    }
    if (type === 'insertCompositionText' || isComposing) {
      const draftData = data ?? value;
      if (draftData && draftData !== nativeDraft && !type.startsWith('delete')) onEdit('strike');
      nativeDraft = draftData;
      publish(value, compositionRelated);
      return;
    }
    nativeDraft = undefined;
    if (type === 'insertLineBreak' || type === 'insertParagraph') onEdit('enter');
    else if (type.startsWith('delete') && changed) {
      const deleted = type === 'deleteContentBackward' && !explicitBackspace
        && removedHangul(previous, value, input.selectionStart);
      if (deleted) {
        // Some iOS keyboards replace a draft syllable with two plain input events.
        // The textarea state still reaches the glasses immediately.
        pendingDelete = {
          ...deleted,
          deadline: performance.now() + hangulReplacementWindow,
          timer: setTimeout(finishDelete, hangulReplacementWindow),
        };
      } else {
        onEdit('erase');
      }
    } else if (type.startsWith('insert') && type !== 'insertFromComposition') onEdit('strike');
    else if (!type && changed) {
      if (value.length < previous.length) onEdit('erase');
      else if (value.split('\n').length > previous.split('\n').length) onEdit('enter');
      else onEdit('strike');
    }
    publish(value, compositionRelated);
  });

  input.addEventListener('compositionend', event => {
    const current = composition;
    composition = undefined;
    if (!current) {
      nativeDraft = undefined;
      publish(input.value, true);
      return;
    }
    const native = input.value;
    if (event.data === '') {
      // An empty end event alone cannot distinguish cancel from a late commit.
      ended = { ...current, cancelled: true };
      publish(native, true);
      return;
    }
    const draftValue = current.before + (current.data ?? '') + current.after;
    const nativeMayLag = native === current.original || native === current.draftBase || native === draftValue;
    const value = typeof event.data === 'string' && nativeMayLag
      ? current.before + event.data + current.after
      : native;
    if (!current.strikes && value !== current.original) onEdit('strike');
    ended = { value };
    publish(value, true);
  });

  return (includeAmbiguous = false) => Boolean(composition || nativeDraft !== undefined || (includeAmbiguous && ended?.cancelled));
}
