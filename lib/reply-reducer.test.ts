import { describe, expect, it } from "vitest";
import { emptyState, reduce } from "./reply-reducer";
import type { StreamEvent } from "./events";
import type { MessageResponse } from "./types";

function msg(id: number, over: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id,
    conversationId: 7,
    senderId: 29,
    senderType: "USER",
    type: "TEXT",
    body: `body ${id}`,
    contextAssetId: null,
    readAt: null,
    createdAt: `2026-08-20T10:00:0${id}Z`,
    ...over,
  };
}

const start: StreamEvent = { event: "reply-start", data: { conversationId: 7, replyId: "a1" } };

describe("reduce", () => {
  it("keeps messages unique by id", () => {
    // the persona's answer arrives twice: once as tokens, once as its own message event
    let s = reduce(emptyState(7), { event: "message", data: msg(1) });
    s = reduce(s, { event: "message", data: msg(1) });

    expect(s.messages).toHaveLength(1);
  });

  it("orders messages by creation time", () => {
    let s = reduce(emptyState(7), { event: "message", data: msg(2) });
    s = reduce(s, { event: "message", data: msg(1) });

    expect(s.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("accumulates tokens into a draft", () => {
    let s = reduce(emptyState(7), start);
    s = reduce(s, { event: "token", data: { conversationId: 7, replyId: "a1", delta: "In " } });
    s = reduce(s, { event: "token", data: { conversationId: 7, replyId: "a1", delta: "Vienna" } });

    expect(s.drafts.a1).toBe("In Vienna");
  });

  it("retires the draft on reply-end", () => {
    let s = reduce(emptyState(7), start);
    s = reduce(s, { event: "token", data: { conversationId: 7, replyId: "a1", delta: "hi" } });
    s = reduce(s, { event: "reply-end", data: { conversationId: 7, replyId: "a1", messageId: 812 } });

    expect(s.drafts).toEqual({});
  });

  it("retires the draft on a refusal, where messageId is null", () => {
    let s = reduce(emptyState(7), start);
    s = reduce(s, { event: "reply-end", data: { conversationId: 7, replyId: "a1", messageId: null } });

    expect(s.drafts).toEqual({});
  });

  it("raises a banner and drops the draft on error", () => {
    let s = reduce(emptyState(7), start);
    s = reduce(s, {
      event: "error",
      data: { conversationId: 7, replyId: "a1", reason: "rate_limited" },
    });

    expect(s.drafts).toEqual({});
    expect(s.banner).toBe("rate_limited");
  });

  it("ignores events belonging to another conversation", () => {
    // one stream carries every conversation the person takes part in
    const s = reduce(emptyState(7), { event: "message", data: msg(1, { conversationId: 99 }) });

    expect(s.messages).toHaveLength(0);
  });
});
