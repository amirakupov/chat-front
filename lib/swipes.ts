import type { SwipeDirection } from "./types";

const KEY = "toc2me.swipes";

/**
 * Which clips this tab has swiped on, and how.
 *
 * The backend cannot answer this: `findFeedVideos` excludes every asset the user has swiped
 * on, and the only related endpoint — `GET /api/feed/favorites` — lists creators, not clips.
 * So a "saved" mark that survives a reload has to live here.
 */
export function swipeMarks(): Record<number, SwipeDirection> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<number, SwipeDirection>;
  } catch {
    return {};
  }
}

/** Records one swipe and returns the whole map, so a caller can drop it straight into state. */
export function markSwipe(
  assetId: number,
  direction: SwipeDirection,
): Record<number, SwipeDirection> {
  const next = { ...swipeMarks(), [assetId]: direction };
  if (typeof window !== "undefined") sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
