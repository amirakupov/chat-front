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

/**
 * The JSON payload of a named SSE event, or `undefined` when there is none.
 *
 * `EV.ERROR` collides with the event EventSource fires on a connection failure: that one is
 * a plain Event, so `data` is missing and parsing it would throw `"undefined" is not valid
 * JSON`. The stream's status already reflects a dropped connection, so such an event carries
 * nothing for a listener.
 */
export function eventPayload(raw: Event): unknown {
  const data = (raw as MessageEvent).data;
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}
