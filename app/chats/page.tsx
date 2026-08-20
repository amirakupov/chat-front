"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, isApiError, type ApiError } from "@/lib/api";
import { useStream } from "@/lib/stream";
import type { ConversationResponse, Page } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

export default function Chats() {
  const [items, setItems] = useState<ConversationResponse[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const { subscribe, status } = useStream();

  const load = useCallback(() => {
    api<Page<ConversationResponse>>("/api/chat/conversations?size=50")
      .then((p) => setItems(p.content))
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  useEffect(load, [load]);

  // any new message changes lastMessage and unreadCount, so the list refetches
  useEffect(() => subscribe((ev) => ev.event === "message" && load()), [subscribe, load]);

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>
        Диалоги <span className={`status ${status}`}>стрим {status}</span>
      </h1>
      <section className="card">
        {items.length === 0 && <p className="dim">пусто — начните из ленты</p>}
        {items.map((c) => (
          <p key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: ".6rem" }}>
            <Link href={`/chats/${c.id}`}>
              {c.partnerDisplayName ?? c.partnerName ?? `партнёр #${c.partnerId}`}
            </Link>{" "}
            {c.personaEnabled ? (
              <span className="mono" style={{ color: "var(--accent)" }}>
                AI
              </span>
            ) : (
              <span className="mono dim">без AI</span>
            )}
            {c.unreadCount > 0 && <span className="mono"> · непрочитано {c.unreadCount}</span>}
            <br />
            <span className="dim">{c.lastMessage ?? "нет сообщений"}</span>
          </p>
        ))}
        <RawJson value={items} label="GET /api/chat/conversations" />
      </section>
    </main>
  );
}
