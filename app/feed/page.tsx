"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { rememberAsset } from "@/lib/seen-assets";
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

export default function Feed() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [index, setIndex] = useState(0);
  const [favorites, setFavorites] = useState<FavoriteCreatorResponse[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const loadFavorites = useCallback(() => {
    api<Page<FavoriteCreatorResponse>>("/api/feed/favorites")
      .then((p) => setFavorites(p.content))
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  useEffect(() => {
    api<Page<AssetResponse>>("/api/feed?size=20")
      .then((p) => setAssets(p.content))
      .catch((e) => isApiError(e) && setErr(e));
    loadFavorites();
  }, [loadFavorites]);

  const current = assets[index];

  useEffect(() => {
    if (current) rememberAsset(current);
  }, [current]);

  async function swipe(direction: SwipeDirection) {
    if (!current) return;
    setNote(null);
    try {
      const res = await send<SwipeResponse>("POST", "/api/feed/swipe", {
        assetId: current.id,
        direction,
      });
      setNote(res.creatorFavorited ? "автор добавлен в избранное" : `свайп ${direction} записан`);
      if (direction === "SAVE") loadFavorites();
    } catch (e) {
      // swiping the same asset twice is a 400 by design — show it, do not treat it as a crash
      if (isApiError(e)) setErr(e);
    } finally {
      setIndex((i) => i + 1);
    }
  }

  async function write() {
    if (!current) return;
    try {
      const conversation = await send<ConversationResponse>("POST", "/api/chat/conversations", {
        creatorId: current.creatorId,
        assetId: current.id,
      });
      router.push(`/chats/${conversation.id}?assetId=${current.id}`);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>Лента</h1>

      <section className="card">
        {!current ? (
          <p className="dim">
            Клипы закончились. Лента отдаёт только чужие видео в статусе ACTIVE — залейте их
            автором в «Студии» или прогоните <span className="mono">scripts/seed_videos.sh</span>.
          </p>
        ) : (
          <>
            <p className="mono">
              #{current.id} · автор #{current.creatorId} ·{" "}
              {current.creatorDisplayName ?? "без имени"}
            </p>
            {current.fileUrl && <video src={current.fileUrl} controls autoPlay muted />}
            <p>{current.title ?? <span className="dim">без заголовка</span>}</p>
            {current.aiContext && (
              <p className="dim">aiContext: {current.aiContext}</p>
            )}
            <div className="row">
              <button onClick={() => void swipe("SAVE")}>сохранить</button>
              <button className="ghost" onClick={() => void swipe("SKIP")}>
                пропустить
              </button>
              <button onClick={() => void write()}>написать автору об этом клипе</button>
            </div>
            {note && <p className="dim">{note}</p>}
            <RawJson value={current} />
          </>
        )}
      </section>

      <section className="card">
        <h2>Избранные авторы</h2>
        {favorites.length === 0 && <p className="dim">пока никого</p>}
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
