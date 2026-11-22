// News contracts adapted from SANDEVISTAN's live-state types.
export type DataStatus = "loading" | "fresh" | "stale" | "unavailable" | "disabled";
export type DataState<T> = { readonly status: DataStatus; readonly value?: T; readonly fetchedAt?: number };
export type NewsItem = { readonly id: string; readonly title: string; readonly source?: string; readonly url?: string; readonly publishedAt?: number; readonly summary?: string };
