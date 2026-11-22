import { terminalMenuLayout } from './terminal-menu-layout.ts';

export function computerPickerLabels(entries: readonly { url: string; name: string; allowed?: boolean }[]) {
  return [...entries.map((entry, index) => {
    let host = 'Invalid address';
    try { host = new URL(entry.url).host || host; } catch { /* The saved address is unusable. */ }
    return `${index + 1}. ${entry.allowed === false ? '! ' : ''}${host} · ${entry.name}`;
  }), 'Back'];
}

export function computerPickerLayout(picker: { id: string | number; entries: readonly { url: string; name: string; allowed?: boolean }[]; selected: number; status?: string }, label: (value: string) => string) {
  return terminalMenuLayout({
    menuId: 'c' + picker.id,
    items: computerPickerLabels(picker.entries),
    selected: picker.selected,
    start: Math.max(0, picker.selected - 5),
  }, label, picker.status);
}
