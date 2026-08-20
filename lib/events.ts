import type { MessageResponse } from "./types";

/** Mirrors ChatStreamEvent on the backend. Keep in sync by hand — one string each. */
export const EV = {
  MESSAGE: "message",
  REPLY_START: "reply-start",
  TOKEN: "token",
  REPLY_END: "reply-end",
  ERROR: "error",
} as const;

export type StreamEvent =
  | { event: "message"; data: MessageResponse }
  | { event: "reply-start"; data: { conversationId: number; replyId: string } }
  | { event: "token"; data: { conversationId: number; replyId: string; delta: string } }
  | { event: "reply-end"; data: { conversationId: number; replyId: string; messageId: number | null } }
  | { event: "error"; data: { conversationId: number; replyId: string | null; reason: string } };

export const EV_NAMES = Object.values(EV);
