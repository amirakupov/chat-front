import type { AssetResponse } from "./types";

const KEY = "toc2me.seenAssets";
// a feed page is 20, and swiped clips stay in the list on top of that
const LIMIT = 60;

/**
 * Clips seen in the feed, kept so the chat screen can offer them as context and so the feed
 * can keep showing a clip it has already swiped on.
 *
 * There is no endpoint that lists another creator's assets — GET /api/content is "mine"
 * only — so the feed is the sole place a viewer ever learns an assetId.
 */
export function rememberAssets(assets: AssetResponse[]): void {
  if (typeof window === "undefined") return;
  const fresh = new Set(assets.map((a) => a.id));
  const kept = seenAssets().filter((a) => !fresh.has(a.id));
  sessionStorage.setItem(KEY, JSON.stringify([...assets, ...kept].slice(0, LIMIT)));
}

export function rememberAsset(asset: AssetResponse): void {
  rememberAssets([asset]);
}

export function seenAssets(): AssetResponse[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as AssetResponse[];
  } catch {
    return [];
  }
}
