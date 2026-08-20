export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Exactly what GlobalExceptionHandler.build() produces. */
export type ApiError = {
  status: number;
  error: string;
  message: string;
  path?: string;
  timestamp?: string;
};

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "status" in e && "message" in e;
}

/**
 * Pure, so it can be tested: two backend paths answer with no body at all —
 * HttpStatusEntryPoint on an unauthenticated request, and the void-returning
 * password-reset endpoints.
 */
export function parseError(status: number, statusText: string, body: unknown): ApiError {
  if (body && typeof body === "object" && typeof (body as ApiError).message === "string") {
    return body as ApiError;
  }
  const fallback = statusText || `HTTP ${status}`;
  return { status, error: fallback, message: fallback };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Every call to the backend goes through here.
 *
 * `credentials: "include"` is the whole design: the access_token cookie is httpOnly, set by
 * :8080 and replayed by the browser to :8080. It works cross-port because a cookie is
 * scoped to the host, and SameSite=Lax counts :3000 → :8080 as same-site.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isJsonBody = typeof init.body === "string";
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) throw parseError(res.status, res.statusText, body);
  return body as T;
}

/** Shorthand for the common JSON POST/PUT/PATCH. */
export function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
