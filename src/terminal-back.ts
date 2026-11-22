export function backAfterInput(input: Pick<HTMLInputElement, "addEventListener" | "removeEventListener" | "blur">, isPending: () => boolean, goBack: () => void, timeout = 450) {
  if (!isPending()) { goBack(); return; }
  let done = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = () => {
    if (done) return;
    done = true; clearTimeout(timer);
    input.removeEventListener('compositionend', check);
    input.removeEventListener('input', check);
    goBack();
  };
  const check = () => queueMicrotask(() => { if (!isPending()) finish(); });
  input.addEventListener('compositionend', check);
  input.addEventListener('input', check);
  timer = setTimeout(finish, timeout);
  input.blur();
  check();
}
