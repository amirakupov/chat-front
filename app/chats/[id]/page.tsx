"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { emptyState, reduce, withHistory, type ChatState } from "@/lib/reply-reducer";
import { seenAssets } from "@/lib/seen-assets";
import { useSession } from "@/lib/session";
import { useStream } from "@/lib/stream";
import type { ConversationResponse, MessageResponse, Page } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

// useSearchParams in a client page needs the route to stay dynamic, otherwise `next build`
// demands a Suspense boundary around it
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  ai_unavailable: "Ключ OpenAI не настроен — персона не ответит. Проверьте OPENAI_API_KEY.",
  rate_limited: "Потолок ответов на диалог — 12 в минуту. Подождите минуту.",
  internal: "Генерация упала. Смотрите лог бэкенда.",
};

export default function Chat() {
  const conversationId = Number(useParams().id);
  const contextFromFeed = useSearchParams().get("assetId");
  const { user } = useSession();
  const { subscribe, status } = useStream();

  const [state, setState] = useState<ChatState>(() => emptyState(conversationId));
  const [conversation, setConversation] = useState<ConversationResponse | null>(null);
  const [body, setBody] = useState("");
  const [assetId, setAssetId] = useState(contextFromFeed ?? "");
  const [err, setErr] = useState<ApiError | null>(null);

  // read once on mount: the feed writes sessionStorage, this screen only offers the result
  const assets = useMemo(() => seenAssets(), []);

  const loadHistory = useCallback(async () => {
    try {
      const page = await api<Page<MessageResponse>>(
        `/api/chat/conversations/${conversationId}/messages?size=50`,
      );
      // the endpoint returns newest first; the reducer wants them oldest first
      setState((s) => withHistory(s, [...page.content].reverse()));
      await send("POST", `/api/chat/conversations/${conversationId}/read`);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }, [conversationId]);

  useEffect(() => {
    // both calls only touch state after awaiting the backend; the rule cannot see through
    // the async boundary and reads the call itself as a synchronous setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
    api<Page<ConversationResponse>>("/api/chat/conversations?size=50")
      .then((p) => setConversation(p.content.find((c) => c.id === conversationId) ?? null))
      .catch(() => undefined);
  }, [conversationId, loadHistory]);

  useEffect(() => subscribe((ev) => setState((s) => reduce(s, ev))), [subscribe]);

  async function sendMessage() {
    if (!body.trim()) return;
    const payload = { body, assetId: assetId ? Number(assetId) : null };
    setBody("");
    try {
      // the message comes back through the stream as well; the reducer dedupes by id
      await send<MessageResponse>(
        "POST",
        `/api/chat/conversations/${conversationId}/messages`,
        payload,
      );
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  const drafts = Object.entries(state.drafts);

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>
        {conversation?.partnerDisplayName ?? `Диалог #${conversationId}`}{" "}
        {conversation?.personaEnabled ? (
          <span className="mono" style={{ color: "var(--accent)" }}>
            AI
          </span>
        ) : (
          <span className="mono dim">без AI</span>
        )}
        <span className={`status ${status}`}> · стрим {status}</span>
      </h1>

      {state.banner && (
        <div className="errorbar banner" role="status">
          {REASONS[state.banner] ?? state.banner}
        </div>
      )}

      <section className="card">
        <div className="bubbles">
          {state.messages.map((m) => (
            <div key={m.id} className={`bubble ${bubbleClass(m, user?.id)}`}>
              {m.body}
              <div className="meta">
                {m.senderType}
                {m.contextAssetId ? ` · из клипа #${m.contextAssetId}` : ""}
                {` · ${new Date(m.createdAt).toLocaleTimeString()}`}
              </div>
            </div>
          ))}
          {drafts.map(([replyId, text]) => (
            <div key={replyId} className="bubble draft">
              {text || "…"}
              <div className="meta">персона печатает · {replyId}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <label>сообщение</label>
        <textarea
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />
        <label>контекст: клип, о котором речь</label>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">без контекста</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} {a.title ?? a.type}
            </option>
          ))}
        </select>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button onClick={() => void sendMessage()}>отправить</button>
          <span className="dim">
            контекст хранится на каждом сообщении, поэтому его можно менять посреди разговора
          </span>
        </div>
      </section>

      <section className="card">
        <p className="dim">
          Автор, написавший сюда сам, AI не запускает — это правило бэкенда: пишет человек, значит
          человек и вмешался. Токены приходят только зрителю, поэтому в окне автора ответ персоны
          появляется целиком.
        </p>
        <RawJson value={state} label="состояние экрана" />
      </section>
    </main>
  );
}

function bubbleClass(m: MessageResponse, myId: number | undefined): string {
  if (m.senderType === "SYSTEM") return "system";
  if (m.senderType === "AI") return "ai";
  return m.senderId === myId ? "mine" : "";
}
