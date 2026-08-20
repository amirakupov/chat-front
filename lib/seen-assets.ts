import type { AssetResponse } from "./types";

const KEY = "toc2me.seenAssets";
const LIMIT = 20;

/**
 * Clips seen in the feed, kept so the chat screen can offer them as context.
 *
 * There is no endpoint that lists another creator's assets — GET /api/content is "mine"
 * only — so the feed is the sole place a viewer ever learns an assetId.
 */
export function rememberAsset(asset: AssetResponse): void {
  if (typeof window === "undefined") return;
  const kept = seenAssets().filter((a) => a.id !== asset.id);
  sessionStorage.setItem(KEY, JSON.stringify([asset, ...kept].slice(0, LIMIT)));
}

export function seenAssets(): AssetResponse[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as AssetResponse[];
  } catch {
    return [];
  }
}
