import { describe, expect, it } from "vitest";
import { eventPayload } from "./events";

describe("eventPayload", () => {
  it("parses the JSON the backend puts in data", () => {
    const raw = { data: '{"conversationId":7,"replyId":"a1","delta":"hi"}' } as MessageEvent;

    expect(eventPayload(raw)).toEqual({ conversationId: 7, replyId: "a1", delta: "hi" });
  });

  it("returns undefined for EventSource's own error event", () => {
    // The backend names one of its events "error", which is also the name EventSource uses
    // for a connection failure — and that one is a plain Event with no data at all.
    expect(eventPayload(new Event("error"))).toBeUndefined();
  });

  it("returns undefined for a payload that is not JSON", () => {
    expect(eventPayload({ data: "<html>nginx</html>" } as MessageEvent)).toBeUndefined();
  });
});
