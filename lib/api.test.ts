import { describe, expect, it } from "vitest";
import { parseError } from "./api";

describe("parseError", () => {
  it("passes through the ApiError the backend sends", () => {
    const body = {
      status: 400,
      error: "Bad Request",
      message: "asset belongs to a different creator",
      path: "/api/chat/conversations/7/messages",
      timestamp: "2026-08-20T10:00:00Z",
    };

    expect(parseError(400, "Bad Request", body)).toEqual(body);
  });

  it("survives an empty body", () => {
    // HttpStatusEntryPoint answers an unauthenticated request with no body at all
    expect(parseError(401, "Unauthorized", null)).toEqual({
      status: 401,
      error: "Unauthorized",
      message: "Unauthorized",
    });
  });

  it("survives a body that is not an ApiError", () => {
    expect(parseError(502, "Bad Gateway", "<html>nginx</html>")).toEqual({
      status: 502,
      error: "Bad Gateway",
      message: "Bad Gateway",
    });
  });
});
