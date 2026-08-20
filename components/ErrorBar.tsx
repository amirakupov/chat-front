"use client";

import type { ApiError } from "@/lib/api";

/**
 * The single place an ApiError is shown. The harness must never swallow one: a silent
 * failure is exactly what it exists to make visible.
 */
export function ErrorBar({ error, onClear }: { error: ApiError | null; onClear: () => void }) {
  if (!error) return null;
  return (
    <div className="errorbar" role="alert">
      <span>
        {error.status} {error.error} · {error.path ?? ""}
        <br />
        {error.message}
      </span>
      <button className="ghost" style={{ marginLeft: "auto" }} onClick={onClear}>
        ×
      </button>
    </div>
  );
}
