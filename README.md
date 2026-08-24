# Toc2me — test harness

A local harness for exercising the chat: viewer↔creator messaging, AI-persona replies, video context.

## The key thing about the two identities

The session cookie is per host, so **two identities means two browser windows**:

- a normal window — the viewer (`user@demo.local`);
- an incognito window — the creator (`creator@demo.local`).

Both use the password `demo1234`. In two normal windows the second sign-in overwrites the first,
and it will look as if the harness is broken. There is no sign-out on purpose: the backend has no
`/auth/logout` and the cookie is `httpOnly` — a full sign-out means clearing cookies in devtools.

## Running it

### 1. Backend

```bash
cd ../Toc2meBack
DB="postgres://amirakupov:postgres@localhost:5432/toc2me"
psql "$DB" -f scripts/migrations/001_asset_object_storage.sql   # on a fresh database
psql "$DB" -f scripts/migrations/002_widen_upload_id.sql        # on a fresh database
psql "$DB" -f scripts/seed-demo-users.sql                      # demo accounts
export OPENAI_API_KEY=sk-...                                   # without it the AI stays silent
./mvnw spring-boot:run
```

The migrations are mandatory: `ddl-auto` does not rewrite CHECK constraints, and without them the
database rejects the `UPLOADING` status.

Without `OPENAI_API_KEY` the provider bean is never created, and every message is answered with a
yellow `ai_unavailable` banner. That is the correct behaviour, but the chat cannot be tested that way.

### 2. Harness

```bash
npm install
npm run dev
```

The port has to be **3000** — it is hardcoded in the backend's CORS config
(`app.cors.allowed-origins`). The backend address comes from `NEXT_PUBLIC_API_URL` in `.env.local`;
that file is not in git, and without it `http://localhost:8080` is used.

### 3. Fill the feed

Either upload videos by hand in the Studio, or use the backend's script:

```bash
cd ../Toc2meBack
BASE_URL=http://localhost:8080 EMAIL=creator@demo.local PASSWORD=demo1234 \
  ./scripts/seed_videos.sh video
```

## Test checklist

### Roles and sign-in
- [ ] “sign in as viewer” → `USER` in the header, with a numeric id
- [ ] “sign in as creator” → `CREATOR`
- [ ] the viewer presses “become a creator” → the role changes, `/studio` opens
- [ ] the profile saves, and after “refresh” the changes are still there
- [ ] interests are listed and save

### Assets
- [ ] mp4 upload: per-part progress, `ACTIVE` status at the end
- [ ] the video plays in `<video>` — the signed URL works without an authorization header
- [ ] `aiContext` saves via “save metadata”
- [ ] the persona avatar uploads and its id lands in the form
- [ ] deleting an asset removes it from the list

### Feed
- [ ] other people's clips are shown, your own are not
- [ ] “save” adds the creator to favourites and marks the clip `saved` — the clip stays in the list
- [ ] swiping the same clip twice returns `400`, and the harness keeps working

The backend removes a swiped clip from `GET /api/feed` for good, and no endpoint lists saved
clips — only favourite creators. So the `saved` / `skipped` marks, and the swiped clips
themselves, are kept in the tab's `sessionStorage`: a new tab starts from what the feed returns.

### Chat — the main part
- [ ] a conversation opened from the feed starts with the persona's greeting right away
- [ ] for the viewer, the persona's reply is typed out token by token in a dashed bubble
- [ ] for the creator, both messages appear without a reload
- [ ] the message footer reads “from clip #N”
- [ ] the persona's reply draws on the clip's `aiContext`
- [ ] the creator writes in person → there is no second AI reply
- [ ] a message on a forbidden topic → a system banner instead of a persona reply
- [ ] unread counts add up and reset once the conversation is opened

### Errors are visible
- [ ] without `OPENAI_API_KEY` → an `ai_unavailable` banner, not silence
- [ ] 13 messages in a minute → a `rate_limited` banner
- [ ] `/studio` under the `USER` role → `403 access denied` (the backend deliberately does not
      explain why; the reason is in its log)
- [ ] `/debug` shows the whole sequence of events

## What the harness does not cover

Password reset (needs a mailbox), R2 and the CDN (dev mode keeps files on disk), running across
several instances (the registry of SSE connections lives in the process's memory).
