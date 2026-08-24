"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { emptyState, reduce, withHistory, type ChatState } from "@/lib/reply-reducer";
import { seenAssets } from "@/lib/seen-assets";
import { useSession } from "@/lib/session";
import { useStream } from "@/lib/stream";
import type { AssetResponse, ConversationResponse, MessageResponse, Page } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

// useSearchParams in a client page needs the route to stay dynamic, otherwise `next build`
// demands a Suspense boundary around it
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  ai_unavailable: "The OpenAI key is not configured — the persona will not reply. Check OPENAI_API_KEY.",
  rate_limited: "The cap is 12 replies per conversation per minute. Wait a minute.",
  internal: "Generation failed. Check the backend log.",
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

  // The feed writes sessionStorage and this screen only offers the result — but reading it
  // while rendering would put clips in the client's first render that the server, which has
  // no window, could not put in the HTML, and hydration would throw the <select> away. So the
  // list arrives after mount instead.
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  // sessionStorage is the external system here, and mount is the only moment it can be read
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAssets(seenAssets()), []);

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
        {conversation?.partnerDisplayName ?? `Conversation #${conversationId}`}{" "}
        {conversation?.personaEnabled ? (
          <span className="mono" style={{ color: "var(--accent)" }}>
            AI
          </span>
        ) : (
          <span className="mono dim">no AI</span>
        )}
        <span className={`status ${status}`}> · stream {status}</span>
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
                {m.contextAssetId ? ` · from clip #${m.contextAssetId}` : ""}
                {` · ${new Date(m.createdAt).toLocaleTimeString()}`}
              </div>
            </div>
          ))}
          {drafts.map(([replyId, text]) => (
            <div key={replyId} className="bubble draft">
              {text || "…"}
              <div className="meta">the persona is typing · {replyId}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <label>message</label>
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
        <label>context: the clip being discussed</label>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">no context</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} {a.title ?? a.type}
            </option>
          ))}
        </select>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button onClick={() => void sendMessage()}>send</button>
          <span className="dim">
            the context is stored on every message, so it can be changed mid-conversation
          </span>
        </div>
      </section>

      <section className="card">
        <p className="dim">
          A creator writing here in person does not trigger the AI — that is a backend rule: if a
          human writes, a human has stepped in. Tokens are only delivered to the viewer, so in the
          creator window the reply from the persona appears all at once.
        </p>
        <RawJson value={state} label="screen state" />
      </section>
    </main>
  );
}

function bubbleClass(m: MessageResponse, myId: number | undefined): string {
  if (m.senderType === "SYSTEM") return "system";
  if (m.senderType === "AI") return "ai";
  return m.senderId === myId ? "mine" : "";
}
