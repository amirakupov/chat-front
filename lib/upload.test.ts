import { describe, expect, it } from "vitest";
import { planParts } from "./upload";

const MB = 1024 * 1024;

function blobOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

describe("planParts", () => {
  it("splits into full parts plus a short tail", () => {
    const parts = planParts(blobOf(20 * MB), 8 * MB);

    expect(parts.map((p) => p.size)).toEqual([8 * MB, 8 * MB, 4 * MB]);
  });

  it("returns one part for a file smaller than the part size", () => {
    const parts = planParts(blobOf(3 * MB), 8 * MB);

    expect(parts.map((p) => p.size)).toEqual([3 * MB]);
  });

  it("does not emit an empty trailing part on an exact multiple", () => {
    const parts = planParts(blobOf(16 * MB), 8 * MB);

    expect(parts.map((p) => p.size)).toEqual([8 * MB, 8 * MB]);
  });
});
