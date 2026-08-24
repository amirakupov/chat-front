# Next.js chat test harness — design

**Date:** 2026-08-20
**Status:** approved for implementation
**Related:** `2026-08-12-video-context-ai-chat-design.md` (the spec of the feature itself)

---

## 1. The problem

The client needs to **check the chat themselves**: user↔creator messaging, AI-persona replies and
what the persona knows about the video someone wrote to it from. Plus everything the chat rests on:
roles, asset uploads, the feed, persona setup.

The harness is not a product. Its job is to make the backend's behaviour **visible**, errors
included. If there is no OpenAI key, the harness must say “ai_unavailable” rather than spin a
spinner.

### Boundaries

- A separate project, `~/Desktop/Work/Toc2me-Harness`. The existing `Toc2me-Frontend` (Vite) stays
  untouched: it is the seed of the real product and has a different future.
- Beauty is not the goal, but the screens have to read: the client walks through a story rather
  than poking endpoints off a list.
- The harness has one user — the client, locally. No deployment, no multi-tenancy, no mobile
  layout.

---

## 2. Decisions made

| Decision | Chosen | Why not otherwise |
|---|---|---|
| Accounts | a SQL seed script with a ready-made user and creator | Registration requires email confirmation; for a demo that is a needless dependency on mail |
| Two identities | two browser tabs, normal and incognito | The cookie is per host — otherwise we would have to move off cookies to Bearer and lose `EventSource` |
| Assets | the full direct flow: `uploads` → PUT of parts → `complete` | This is the production path, and in dev mode it works unchanged (`LocalStorageService`) |
| Own id | a new `GET /api/user/me` in the backend | The only alternative is hardcoding the ids from the seed; that lies about an API the real frontend will need anyway |
| App style | role-based screens plus a “raw JSON” toggle on each | An API console cannot show the token stream and the system messages — which is exactly what we were asked to check |

---

## 3. Architecture

### Stack

Next.js 15 (App Router) + TypeScript. Every page is a client component; Next is a dev server,
a router and types here, nothing more. Server components would demand a second authentication path
(forwarding the cookie on the server) and would add nothing to the harness.

Zero UI libraries. One `globals.css` built on CSS variables. State lives in React context: one for
the session, one for the stream. Vitest covers two pure modules only.

### Authentication: the browser talks straight to the backend

```
localhost:3000 (Next)  ──fetch credentials:"include"──►  localhost:8080 (Spring)
                       ◄─────Set-Cookie: access_token───
```

There is **deliberately no Next proxy**: it can buffer SSE, and then the tokens arrive in one batch
at the end instead of as a stream. Talking directly works for three reasons, all verified in the
code:

1. The cookie is bound to the `localhost` host without regard to the port — `:8080` sets it, and the
   browser sends it on `:3000` and back.
2. `SameSite=Lax` treats `:3000 → :8080` as same-site: a site is the scheme plus the registrable
   domain, and the port does not count.
3. `SecurityConfig` already allows `http://localhost:3000` with `allowCredentials(true)` and puts
   `ETag` in `exposedHeaders` — without that there would be nothing to fill the “complete” step with.

The cookie's lifetime now equals the token's lifetime (24 h), so a long stream will not die after
an hour.

### The chat data flow

```
USER (tab 1)                     BACKEND                      CREATOR (tab 2, incognito)
     │                              │                                    │
     ├─ POST /conversations ────────►│  (creatorId, assetId from feed)   │
     ├─ POST .../messages ──────────►│                                    │
     │                               ├── AFTER_COMMIT ───────────────────►│  event: message
     │◄──── event: message ──────────┤                                    │
     │◄──── reply-start ─────────────┤  @Async: generation                │
     │◄──── token × N ───────────────┤                                    │
     │◄──── reply-end (messageId) ───┤                                    │
     │◄──── event: message (reply) ──┤── the same to the creator ────────►│  event: message
```

The harness has to show this as it is: the user's bubble fills up token by token, while for the
creator it appears whole — the creator never receives `token`, only `message`. That is not a bug but
a consequence of the reply stream being addressed to the visitor.

---

## 4. Backend change: `GET /api/user/me`

The only backend edit in the whole piece of work.

```java
@GetMapping("/user/me")
public UserDto me(@AuthenticationPrincipal UserAdapter principal) {
    return UserMapper.toDto(principal.user());
}
```

**Why.** Right now a client cannot learn its own id: the token's subject is the email, and the only
claims are `role` and `firstTimeLogin`. That makes `PATCH /api/user/update/{id}` impossible to call
— there is nowhere to get the id from except the `become-creator` response. That is a hole in the
API, not an inconvenience of the harness.

`UserAdapter` already holds the user reloaded from the database, so the answer is always fresh — a
role changed a minute ago shows up immediately, unlike a claim inside the token.

Test: `UserControllerTest.meReturnsTheCallerFromTheDatabase`.

---

## 5. Seed script

`scripts/seed-demo-users.sql` in the backend repository.

Login requires `account_status = 'ACTIVE'` (`AuthService.loginAndGetToken`), and only email
confirmation sets it. The script sets the status directly — mail leaves the equation.

It creates:

| Email | Password | Role | Anything else |
|---|---|---|---|
| `user@demo.local` | `demo1234` | `USER` | `account_status=ACTIVE` |
| `creator@demo.local` | `demo1234` | `CREATOR` | `account_status=ACTIVE`, persona enabled |

The password is a pre-computed BCrypt hash written into the script as a constant; otherwise the
session would need Java running. The script is idempotent (`ON CONFLICT (email) DO UPDATE`) and does
not pin the ids — the harness learns them through `/api/user/me`.

The creator's persona is seeded already enabled and with a `greeting`, so the very first conversation
starts with a greeting — that exercises `sendPersonaGreeting` with no manual setup.

---

## 6. Modules

Five units, each with one job. All dependencies point down the list.

### `lib/api.ts` — transport

The single place where `credentials: "include"`, the base URL and error parsing live.

The error shape is set by the backend — `GlobalExceptionHandler` returns an `ApiError` in every case:

```ts
type ApiError = {                   // exactly what GlobalExceptionHandler.build() constructs
  status: number;
  error: string;                    // reason phrase, e.g. "Bad Request"
  message: string;
  path: string;
  timestamp: string;
};
async function api<T>(path: string, init?: RequestInit): Promise<T>;
```

Throws `ApiError` on non-2xx. It does not intercept `401` — the session layer does that.

Two cases where there is no body and parsing has to survive them: `POST /auth/forgot-password` and
`POST /auth/reset-password` return `void`, and a `401` from `HttpStatusEntryPoint` (an
unauthenticated request) arrives with no body at all — unlike a `401` from
`GlobalExceptionHandler`, which does have one. On an empty body we substitute
`{status, error: response.statusText, message: response.statusText}`.

A detail worth knowing while debugging: on `403` the backend deliberately answers with an
inscrutable `"access denied"` and writes the real reason, along with the list of authorities, to its
log. So `/studio` opened under `USER` will show a blank “access denied” — and that is the correct
behaviour, not the harness breaking. Caption it on the screen.

### `lib/session.tsx` — who am I

Context: `{ user: UserDto | null, login, logout, refresh }`. On startup it calls `/api/user/me`; a
`401` means “not logged in” and does not count as an error. `login` does `POST /auth/login` (the
cookie is set by the response) and then `refresh`.

It does not store the token: the token lives in an httpOnly cookie, and that is exactly the
behaviour that needs checking.

### `lib/stream.tsx` — SSE

One `EventSource` per tab, `withCredentials: true`, opened after a successful `/me`. It hands events
out through context and keeps a log of the last 200 for `/debug`.

```ts
type StreamState = {
  status: "connecting" | "open" | "closed";
  log: { at: number; event: string; data: unknown }[];
};
```

Named events: `message`, `reply-start`, `token`, `reply-end`, `error`.
The names come from the backend's `ChatStreamEvent` and are mirrored as constants in `lib/events.ts`.

### `lib/reply-reducer.ts` — assembling the reply (a pure function, under test)

The trickiest spot in the harness, which is why it is extracted and covered by tests.

```ts
type ChatState = {
  messages: MessageResponse[];          // ascending by createdAt
  drafts: Record<string, string>;       // replyId → accumulated text
  banner: string | null;                // ai_unavailable / rate_limited / internal
};
function reduce(state: ChatState, ev: StreamEvent): ChatState;
```

The rules, one test each:

- a `message` with an already-known id is **not duplicated**: the persona's reply arrives both as
  tokens and as a separate `message` event.
- `token` appends to the draft keyed by `replyId`.
- `reply-end` with a `messageId` retires the draft; the text itself will arrive (or already has) in
  a `message`.
- `reply-end` with `messageId: null` — the model refused: retire the draft, a system message follows.
- `error` retires the draft and raises a banner.
- events from another conversation are ignored: there is one stream for all conversations.

### `lib/upload.ts` — direct upload (the pure parts under test)

```ts
function planParts(file: File, partSize: number): Blob[];   // tested
async function uploadAsset(file: File, type: AssetType, onProgress): Promise<AssetResponse>;
```

Three steps per `docs/media-upload.md`: `POST /api/content/uploads` → PUT of parts, 3 in parallel,
with the mandatory `Content-Type: plan.contentType` → `POST .../complete` with the collected ETags.
On a `403` for a part — re-request the URL once via `POST /api/content/uploads/{id}/parts` and
retry. Cancelling is `DELETE /api/content/uploads/{id}`.

The persona's avatar is uploaded with a plain `POST /api/content/upload` (multipart) — that way both
paths are covered.

---

## 7. Screens and API coverage

| Screen | Endpoints |
|---|---|
| `/` | `POST /auth/login`, `GET /api/user/me`, `POST /api/user/become-creator`, `PATCH /api/user/update/{id}`, `GET /api/interests`, `POST /api/user/interests`; collapsible block: `POST /auth/register`, `GET /auth/confirm`, `POST /auth/resend-confirmation` |
| `/studio` | `GET /api/persona`, `PUT /api/persona`, `POST /api/content/uploads`, `PUT /api/content/uploads/direct` (the signed URL from the plan; in production this is a PUT straight to R2), `POST .../parts`, `POST .../complete`, `DELETE /api/content/uploads/{id}`, `POST /api/content/upload`, `GET /api/content`, `GET /api/content/{id}`, `PATCH /api/content/{id}/metadata`, `DELETE /api/content/{id}` |
| `/feed` | `GET /api/feed`, `POST /api/feed/swipe`, `GET /api/feed/favorites`, `GET /api/content/{id}/file` (via `fileUrl` in `<video>`), `POST /api/chat/conversations` |
| `/chats` | `GET /api/chat/conversations` |
| `/chats/[id]` | `GET /api/chat/conversations/{id}/messages`, `POST .../messages`, `POST .../read` |
| the whole harness | `GET /api/chat/stream` |

The backend has 34 endpoints plus the new `/api/user/me` — 35. The harness leaves **three** alone:
password reset (section 10). The other 32 are covered.

### What has to be visible on `/chats/[id]`

- a bubble with a **“from clip #N”** badge driven by `contextAssetId` — that is the proof the video
  made it into the prompt;
- system messages in their own style: `senderType=SYSTEM` is the platform, not the persona;
- a clip selector next to the input — a message with an `assetId` can be sent at any moment, since
  the context is stored per message rather than per conversation;
- an “AI” badge in the header when `personaEnabled=false` — the harness must not promise a reply
  that will not come.

---

## 8. Error handling

By default the harness **swallows nothing**. One bar at the top of the screen: code, endpoint, body.

The states where silence is the worst outcome are handled separately:

| Situation | What to show |
|---|---|
| `error: ai_unavailable` | “The OpenAI key is not configured — the persona will not reply” |
| `error: rate_limited` | “A cap of 12 replies per minute per conversation” |
| `error: internal` | the text plus a pointer to the backend logs |
| the stream closed | a `closed` indicator and a reconnect button on every screen |
| `POST /swipe` twice on one asset | show the 400 as it is, do not treat it as a failure |
| `personaEnabled=false` | do not draw a draft bubble at all |

---

## 9. Testing

The harness is checked by hand — that is what it is for. Automated tests exist only where a mistake
is invisible to the eye:

- `reply-reducer.test.ts` — the six rules from section 6, including deduplication by id;
- `upload.test.ts` — the part slicing: boundaries, a short final part, a file smaller than one part.

`UserControllerTest` lives on the backend side, written TDD-style like the rest of the plan's tasks.

---

## 10. Deliberately not covered

- **Password reset** (`forgot-password`, `validate-reset-token`, `reset-password`) — it needs access
  to a mailbox, and with seeded accounts the path is pointless.
- **Multi-instance.** The registry of SSE emitters lives in the JVM's memory. The harness talks to a
  single process; behind a load balancer without sticky sessions it will not work.
- **R2 and the CDN.** Dev mode (`r2.enabled=false`) keeps files on disk and serves signed
  `/api/content/uploads/direct`. The client code does not depend on that, but the harness does not
  exercise a real CDN either.
- **Moderation, payments, age gates.** The backend does not have them yet.

---

## 11. Pitfalls

1. **Incognito is mandatory.** The cookie is per host; two normal windows will overwrite each
   other's session and the client will conclude the harness is broken. First paragraph of the README.
2. **The OpenAI key.** Without `OPENAI_API_KEY` the provider bean is never created and every message
   is answered with `ai_unavailable`. Check before the demo.
3. **Migrations.** `scripts/migrations/001` and `002` are mandatory on a fresh database: `ddl-auto`
   does not rewrite CHECK constraints, and the `UPLOADING` status will be rejected.
4. **The creator's first message does not trigger the AI.** This is a deliberate backend rule: when
   a human writes, the persona stays quiet. Caption it on the screen, otherwise it looks like a bug.
5. **A 4000-character cap** per message, and the model's reply truncated by `max-reply-tokens`.
6. **`app.base-url`** in the dev config is `http://localhost:3000/app`, meaning the confirmation
   links in emails point at the harness's port. We are not building an `/app/confirm` route, but it
   is worth knowing: if the client does register on their own, the link lands on a 404.
