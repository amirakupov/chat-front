import type { StreamEvent } from "./events";
import type { MessageResponse } from "./types";

export type ChatState = {
  conversationId: number;
  /** ascending by createdAt */
  messages: MessageResponse[];
  /** replyId → text accumulated so far */
  drafts: Record<string, string>;
  /** last error reason: ai_unavailable | rate_limited | internal */
  banner: string | null;
};

export function emptyState(conversationId: number): ChatState {
  return { conversationId, messages: [], drafts: {}, banner: null };
}

function withoutDraft(drafts: Record<string, string>, replyId: string): Record<string, string> {
  const next = { ...drafts };
  delete next[replyId];
  return next;
}

export function reduce(state: ChatState, ev: StreamEvent): ChatState {
  // one stream serves every conversation; the screen only wants its own
  if (ev.data.conversationId !== state.conversationId) return state;

  switch (ev.event) {
    case "message": {
      // the persona's reply arrives twice — as tokens and as its own message event
      if (state.messages.some((m) => m.id === ev.data.id)) return state;
      const messages = [...state.messages, ev.data].sort((a, b) =>
        a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1,
      );
      return { ...state, messages };
    }
    case "reply-start":
      return { ...state, banner: null, drafts: { ...state.drafts, [ev.data.replyId]: "" } };
    case "token":
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [ev.data.replyId]: (state.drafts[ev.data.replyId] ?? "") + ev.data.delta,
        },
      };
    case "reply-end":
      // messageId null means the model refused: drop the draft, a SYSTEM message follows
      return { ...state, drafts: withoutDraft(state.drafts, ev.data.replyId) };
    case "error":
      return {
        ...state,
        banner: ev.data.reason,
        drafts: ev.data.replyId ? withoutDraft(state.drafts, ev.data.replyId) : {},
      };
  }
}

/** Merges a page of history into the state, keeping the uniqueness and ordering rules. */
export function withHistory(state: ChatState, page: MessageResponse[]): ChatState {
  return page.reduce((acc, m) => reduce(acc, { event: "message", data: m }), state);
}
