// Keep asynchronous completions from updating a view the user has already left.
type State<T> = { status: "idle" | "loading" | "fresh" | "stale" | "unavailable" | "disabled"; value?: readonly T[]; fetchedAt?: number };
type Load<T> = (options: { force: boolean; onCached: (cached: State<T>) => void }) => Promise<State<T>>;
export function createNewsController<T>(load: Load<T>, onChange: (state: State<T>) => void) {
  let generation = 0;
  let state: State<T> = { status: 'idle', value: [] };
  const publish = (next: State<T>) => { state = next; onChange(state); };
  async function refresh({ force = false } = {}) {
    const request = ++generation;
    publish({ ...state, status: 'loading' });
    try {
      const result = await load({ force, onCached: cached => {
        if (request === generation) publish(cached);
      } });
      if (request === generation) publish(result);
    } catch {
      if (request === generation) publish(state.value?.length ? { ...state, status: 'stale' } : { status: 'unavailable', value: [] });
    }
  }
  return { refresh, close() { generation++; }, current: () => state };
}
