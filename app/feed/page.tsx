"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isApiError, send, storeUrl, type ApiError } from "@/lib/api";
import { rememberAssets, seenAssets } from "@/lib/seen-assets";
import { markSwipe, swipeMarks } from "@/lib/swipes";
import type {
  AssetResponse,
  ConversationResponse,
  FavoriteCreatorResponse,
  Page,
  SwipeDirection,
  SwipeResponse,
} from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

/** Newest first, with the freshly fetched copy of a clip winning over the remembered one. */
function merge(fetched: AssetResponse[], remembered: AssetResponse[]): AssetResponse[] {
  const byId = new Map(remembered.map((a) => [a.id, a]));
  fetched.forEach((a) => byId.set(a.id, a));
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default function Feed() {
  const router = useRouter();
  const [items, setItems] = useState<AssetResponse[]>([]);
  const [marks, setMarks] = useState<Record<number, SwipeDirection>>({});
  const [favorites, setFavorites] = useState<FavoriteCreatorResponse[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const loadFavorites = useCallback(() => {
    api<Page<FavoriteCreatorResponse>>("/api/feed/favorites")
      .then((p) => setFavorites(p.content))
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  // sessionStorage holds the clips the feed will not return again; it cannot be read while
  // rendering, because the server has no window and hydration would find a different list
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setItems(seenAssets());
    setMarks(swipeMarks());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    api<Page<AssetResponse>>("/api/feed?size=20")
      .then((page) => {
        rememberAssets(page.content);
        setItems((shown) => merge(page.content, shown));
      })
      .catch((e) => isApiError(e) && setErr(e));
    loadFavorites();
  }, [loadFavorites]);

  async function swipe(asset: AssetResponse, direction: SwipeDirection) {
    setNote(null);
    try {
      const res = await send<SwipeResponse>("POST", "/api/feed/swipe", {
        assetId: asset.id,
        direction,
      });
      // the clip stays on screen: the mark is the only thing that changes
      setMarks(markSwipe(asset.id, direction));
      setNote(
        res.creatorFavorited
          ? `creator #${asset.creatorId} added to favourites`
          : `swipe ${direction} on #${asset.id} recorded`,
      );
      if (direction === "SAVE") loadFavorites();
    } catch (e) {
      // swiping the same asset twice is a 400 by design — show it, do not treat it as a crash
      if (isApiError(e)) setErr(e);
    }
  }

  async function write(asset: AssetResponse) {
    try {
      const conversation = await send<ConversationResponse>("POST", "/api/chat/conversations", {
        creatorId: asset.creatorId,
        assetId: asset.id,
      });
      router.push(`/chats/${conversation.id}?assetId=${asset.id}`);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>Feed</h1>
      <p className="dim">
        The backend drops a clip from <span className="mono">GET /api/feed</span> the moment it is
        swiped on, and no endpoint lists saved clips — only favourite creators. So a swiped clip
        stays in this list from the tab&apos;s own memory, and the mark is what changes.
      </p>
      {note && <p className="dim">{note}</p>}

      {items.length === 0 && (
        <section className="card">
          <p className="dim">
            No clips. The feed only serves videos from other creators in the ACTIVE status —
            upload some as a creator in the Studio or run{" "}
            <span className="mono">scripts/seed_videos.sh</span>.
          </p>
        </section>
      )}

      {items.map((asset) => (
        <Clip
          key={asset.id}
          asset={asset}
          mark={marks[asset.id]}
          onSwipe={swipe}
          onWrite={write}
        />
      ))}

      <section className="card">
        <h2>Favourite creators</h2>
        {favorites.length === 0 && <p className="dim">nobody yet</p>}
        <ul>
          {favorites.map((f) => (
            <li key={f.creatorId} className="mono">
              #{f.creatorId} · {f.creatorEmail}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Clip({
  asset,
  mark,
  onSwipe,
  onWrite,
}: {
  asset: AssetResponse;
  mark: SwipeDirection | undefined;
  onSwipe: (asset: AssetResponse, direction: SwipeDirection) => Promise<void>;
  onWrite: (asset: AssetResponse) => Promise<void>;
}) {
  return (
    <section className="card">
      <p className="mono">
        #{asset.id} · creator #{asset.creatorId} · {asset.creatorDisplayName ?? "unnamed"}
        {mark === "SAVE" && <span style={{ color: "var(--accent)" }}> · saved</span>}
        {mark === "SKIP" && <span className="dim"> · skipped</span>}
      </p>
      {asset.fileUrl && <video src={storeUrl(asset.fileUrl)} controls preload="metadata" />}
      <p>{asset.title ?? <span className="dim">no title</span>}</p>
      {asset.aiContext && <p className="dim">aiContext: {asset.aiContext}</p>}
      <div className="row">
        {/* the buttons stay live after a mark: a second swipe is the 400 the harness exists to show */}
        <button onClick={() => void onSwipe(asset, "SAVE")}>save</button>
        <button className="ghost" onClick={() => void onSwipe(asset, "SKIP")}>
          skip
        </button>
        <button onClick={() => void onWrite(asset)}>message the creator about this clip</button>
      </div>
      <RawJson value={asset} />
    </section>
  );
}
