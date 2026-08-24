"use client";

/** Every screen carries one: the client must be able to see the real payload. */
export function RawJson({ value, label = "raw JSON" }: { value: unknown; label?: string }) {
  return (
    <details className="raw">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
