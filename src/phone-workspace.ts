export function isWorkspaceTarget(target: Node | null, writer: Node | null) {
  if (!target || target === writer) return true;
  const element = target.nodeType === 3 ? target.parentElement : target;
  if (!element || !("closest" in element) || typeof element.closest !== "function") return true;
  return !element.closest('button, a, input, select, textarea, dialog, [contenteditable="true"], [role="button"]');
}
