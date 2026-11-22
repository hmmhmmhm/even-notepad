export const X_POST_LIMIT = 200;

export function trimXPosts<T>(posts: T[], selected: number, limit = X_POST_LIMIT) {
  const remove = Math.min(Math.max(0, posts.length - limit), Math.max(0, selected));
  return { posts: remove ? posts.slice(remove) : posts, selected: selected - remove, removed: remove };
}
