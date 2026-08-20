# Тестовый стенд чата на Next.js — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальный стенд, на котором клиент сам проверяет переписку user↔creator, стриминговые ответы AI-персоны и то, что персона знает про видео, — вместе со всем, на что чат опирается: ролями, ассетами, лентой, персоной.

**Architecture:** Next.js App Router, все страницы клиентские. Браузер ходит в бэкенд напрямую с `credentials: "include"` — прокси-роутов Next нет сознательно, они буферизуют SSE. Две личности держатся в двух окнах браузера (обычное и инкогнито), потому что кука одна на хост. Логика, где ошибки не видны глазом, вынесена в чистые модули под тестами: сборка стримового ответа и нарезка файла на части.

**Tech Stack:** Next.js 15, TypeScript, Vitest. Ноль UI-библиотек, ноль стейт-менеджеров. Бэкенд — существующий Spring Boot на `:8080`.

**Spec:** `docs/superpowers/specs/2026-08-20-chat-test-harness-design.md`

## Global Constraints

- Стенд живёт в **`~/Desktop/Work/Toc2me-Harness`** (новый проект). Существующий `Toc2me-Frontend` — Vite, его не трогаем.
- Порт стенда — **ровно 3000**: он прошит в CORS бэкенда (`app.cors.allowed-origins`). Бэкенд — `http://localhost:8080`.
- Каждый запрос к бэкенду идёт с **`credentials: "include"`**. Route handlers и rewrites в Next **не создавать**.
- Все компоненты — клиентские (`"use client"`). Серверных компонентов нет: они потребовали бы второго пути аутентификации.
- Никаких UI-библиотек, CSS-фреймворков и стейт-менеджеров. Один `app/globals.css` на CSS-переменных.
- Тесты — Vitest, только на чистые модули: `reply-reducer.ts`, `upload.ts`, `parseError` из `api.ts`. Остальное проверяется руками — это тестовый стенд.
- Изменения в бэкенде (репозиторий `Toc2meBack`) — **только** Task 1 и Task 2. Всё прочее в бэкенде не трогать.
- Имена SSE-событий берутся из `ChatStreamEvent`: `message`, `reply-start`, `token`, `reply-end`, `error`.
- Коммиты — чистым сообщением **без трейлеров коавторства**, сразу `git push`.
- Тесты бэкенда прогонять как `./mvnw -B test -Dtest='!Toc2meBackApplicationTests' -Dsurefire.failIfNoSpecifiedTests=false` — `Toc2meBackApplicationTests` требует живую БД и падает по базлайну, это не связано с этой работой.

---

## File Structure

### Репозиторий `Toc2meBack` (только Task 1–2)

| Файл | Ответственность |
|---|---|
| `src/main/java/.../user/controller/UserController.java` | +`GET /api/user/me` |
| `src/test/java/.../user/controller/UserControllerTest.java` | тест на `/me` |
| `scripts/seed-demo-users.sql` | готовые аккаунты, персона, интересы |

### Репозиторий `Toc2me-Harness` (Task 3–13)

| Файл | Ответственность |
|---|---|
| `app/globals.css` | вся вёрстка стенда, CSS-переменные |
| `app/layout.tsx` | провайдеры сессии и стрима, навигация |
| `app/page.tsx` | вход, личность, роль, профиль, интересы, регистрация |
| `app/studio/page.tsx` | персона и ассеты креатора |
| `app/feed/page.tsx` | лента, свайпы, избранное, старт диалога |
| `app/chats/page.tsx` | список диалогов |
| `app/chats/[id]/page.tsx` | переписка, стрим токенов, контекст клипа |
| `app/debug/page.tsx` | сырой журнал SSE, состояние стрима |
| `components/ErrorBar.tsx` | единственное место, где показывается `ApiError` |
| `components/RawJson.tsx` | тумблер «сырой JSON» для любого объекта |
| `lib/types.ts` | зеркало DTO бэкенда |
| `lib/api.ts` | транспорт, `credentials: include`, разбор ошибок |
| `lib/demo.ts` | демо-креды из seed-скрипта |
| `lib/session.tsx` | кто я: `/me`, вход, смена аккаунта |
| `lib/events.ts` | имена и типы SSE-событий |
| `lib/reply-reducer.ts` | сборка ответа из событий (чистая, под тестом) |
| `lib/stream.tsx` | один `EventSource` на вкладку, журнал |
| `lib/upload.ts` | трёхшаговая прямая загрузка (нарезка под тестом) |
| `lib/seen-assets.ts` | клипы, увиденные в ленте — источник контекста для чата |
| `README.md` | инструкция клиенту и чеклист ручной проверки |

---

## Task 1: `GET /api/user/me`

Клиент не может узнать свой id: subject токена — email, в claim'ах только `role` и `firstTimeLogin`. Из-за этого `PATCH /api/user/update/{id}` невозможно позвать. Это дыра в API, а не неудобство стенда.

**Files:**
- Modify: `src/main/java/com/backend/toc2me/user/controller/UserController.java`
- Test: `src/test/java/com/backend/toc2me/user/controller/UserControllerTest.java`

**Interfaces:**
- Consumes: `UserAdapter.user()`, `UserMapper.toDto(User)`, `UserDto`.
- Produces: `GET /api/user/me` → `UserDto { id, name, email, age, location, role }`.

- [ ] **Step 1: Написать падающий тест**

Создать `src/test/java/com/backend/toc2me/user/controller/UserControllerTest.java`:

```java
package com.backend.toc2me.user.controller;

import com.backend.toc2me.auth.security.AuthTokenIssuer;
import com.backend.toc2me.auth.security.UserAdapter;
import com.backend.toc2me.user.dto.UserDto;
import com.backend.toc2me.user.entity.User;
import com.backend.toc2me.user.entity.enums.Role;
import com.backend.toc2me.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock private UserService userService;
    @Mock private AuthTokenIssuer tokenIssuer;

    @Test
    void meReturnsTheCallerFromTheDatabase() {
        User caller = User.builder()
                .id(29)
                .name("Demo Viewer")
                .email("user@demo.local")
                .role(Role.USER)
                .build();

        UserDto dto = new UserController(userService, tokenIssuer).me(new UserAdapter(caller));

        // JwtAuthFilter reloads the principal on every request, so this is always current —
        // unlike the role claim baked into the token
        assertThat(dto.getId()).isEqualTo(29);
        assertThat(dto.getEmail()).isEqualTo("user@demo.local");
        assertThat(dto.getRole()).isEqualTo(Role.USER);
    }
}
```

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `./mvnw -B test -Dtest=UserControllerTest`
Expected: FAIL — компиляция, метода `me` не существует.

- [ ] **Step 3: Добавить эндпоинт**

В `UserController.java` добавить импорт `org.springframework.web.bind.annotation.GetMapping` и метод перед `becomeCreator`:

```java
    /**
     * Who the caller is.
     *
     * <p>A client cannot work this out on its own: the token's subject is the email and its
     * claims carry only the role, so nothing else exposes the numeric id that
     * {@link #updateUserData} requires in its path.
     */
    @GetMapping("/user/me")
    public UserDto me(@AuthenticationPrincipal UserAdapter principal) {
        return UserMapper.toDto(principal.user());
    }
```

- [ ] **Step 4: Запустить и убедиться в прохождении**

Run: `./mvnw -B test -Dtest=UserControllerTest`
Expected: PASS, 1 тест.

- [ ] **Step 5: Прогнать весь набор**

Run: `./mvnw -B test -Dtest='!Toc2meBackApplicationTests' -Dsurefire.failIfNoSpecifiedTests=false`
Expected: BUILD SUCCESS, 62 теста.

- [ ] **Step 6: Коммит**

```bash
git add src/main/java/com/backend/toc2me/user/controller/UserController.java src/test/java/com/backend/toc2me/user/controller/UserControllerTest.java
git commit -m "feat(user): GET /api/user/me"
git push
```

---

## Task 2: Seed-скрипт демо-аккаунтов

Логин требует `account_status = 'ACTIVE'` (`AuthService.loginAndGetToken`), а его ставит только подтверждение письма. Скрипт ставит статус напрямую — почта уходит из уравнения.

**Files:**
- Create: `scripts/seed-demo-users.sql`

**Interfaces:**
- Produces: аккаунты `user@demo.local` / `creator@demo.local`, пароль `demo1234`; включённая персона креатора; пять интересов.

- [ ] **Step 1: Написать скрипт**

Создать `scripts/seed-demo-users.sql`:

```sql
-- Demo accounts for the chat test harness.
--
-- Login requires account_status = 'ACTIVE' (AuthService.loginAndGetToken), which normally
-- happens only when someone clicks the confirmation link in an email. This sets it
-- directly, which is the entire point: the harness must not depend on a mailbox.
--
-- Password for both accounts: demo1234
-- The hash is BCrypt cost 10, produced with:
--     htpasswd -bnBC 10 "" demo1234 | tr -d ':\n'
-- Spring's BCryptPasswordEncoder accepts the $2y$ prefix unchanged.
--
-- Idempotent: safe to re-run.

INSERT INTO users (name, email, password, role, verification_level, account_status,
                   first_time_login, created_at)
VALUES
    ('Demo Viewer', 'user@demo.local',
     '$2y$10$80Gki4amlqfPKxOOVs.f8eAcUdBjR/8T/7Qe/4rZn1AKBDk7AcsYK',
     'USER', 'REGISTERED', 'ACTIVE', false, now()),
    ('Demo Creator', 'creator@demo.local',
     '$2y$10$80Gki4amlqfPKxOOVs.f8eAcUdBjR/8T/7Qe/4rZn1AKBDk7AcsYK',
     'CREATOR', 'REGISTERED', 'ACTIVE', false, now())
ON CONFLICT (email) DO UPDATE
    SET password       = EXCLUDED.password,
        role           = EXCLUDED.role,
        account_status = 'ACTIVE';

-- The persona is what makes the AI answer at all: AiReplyService returns early unless
-- findByCreatorIdAndEnabledTrue finds one. Seeded enabled and with a greeting, so the
-- very first conversation opens with sendPersonaGreeting firing.
INSERT INTO creator_personas (creator_id, display_name, description, tonality, topics,
                              boundaries, greeting, enabled, created_at)
SELECT u.id,
       'Anna',
       'Танцовщица из Вены. Снимает короткие клипы с репетиций и уличных выступлений.',
       'Тепло и коротко, на языке собеседника. Без формальностей, иногда одно эмодзи.',
       'танец, репетиции, Вена, музыка, закулисье съёмок',
       'политика, медицинские советы, встречи офлайн',
       'Привет! Рада, что зашёл. Спрашивай про клип — расскажу, как снимали.',
       true,
       now()
FROM users u
WHERE u.email = 'creator@demo.local'
ON CONFLICT (creator_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        greeting     = EXCLUDED.greeting,
        enabled      = true;

-- GET /api/interests returns [] on a fresh database: nothing else seeds this table.
INSERT INTO interests (name)
VALUES ('Танцы'), ('Музыка'), ('Путешествия'), ('Спорт'), ('Кулинария')
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 2: Применить к базе**

```bash
psql "${DATABASE_URL:-postgres://amirakupov:postgres@localhost:5432/toc2me}" -f scripts/seed-demo-users.sql
```

Expected: три `INSERT 0 …` без ошибок. Таблицы должен был уже создать Hibernate — если их нет, поднять бэкенд один раз (`./mvnw spring-boot:run`) и повторить.

- [ ] **Step 3: Проверить, что логин работает**

Бэкенд должен быть запущен.

```bash
curl -si -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@demo.local","password":"demo1234"}' | head -20
```

Expected: `HTTP/1.1 200`, заголовок `Set-Cookie: access_token=…; Max-Age=86400`, тело `{"token":"eyJ…"}`.

Если пришёл `401 invalid credentials or token` — значит эта сборка Spring Security не приняла префикс `$2y$`. Тогда заменить в скрипте `$2y$` на `$2a$` (тот же алгоритм, другая метка ревизии) и повторить шаги 2–3:

```bash
sed -i '' 's/\$2y\$/\$2a\$/g' scripts/seed-demo-users.sql
```

- [ ] **Step 4: Проверить креатора и персону**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"creator@demo.local","password":"demo1234"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -s http://localhost:8080/api/persona -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8080/api/user/me -H "Authorization: Bearer $TOKEN"
```

Expected: персона с `"displayName":"Anna"` и `"enabled":true`; `/me` отдаёт `"role":"CREATOR"` и числовой `id`.

- [ ] **Step 5: Коммит**

```bash
git add scripts/seed-demo-users.sql
git commit -m "chore: seed demo accounts and persona for the test harness"
git push
```

---

## Task 3: Каркас стенда

**Files:**
- Create: `~/Desktop/Work/Toc2me-Harness/` (весь проект)
- Create: `.env.local`, `vitest.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx` (заглушка), `components/ErrorBar.tsx`, `components/RawJson.tsx`

**Interfaces:**
- Produces: `ErrorBar({ error, onClear })`, `RawJson({ value, label? })`, переменная окружения `NEXT_PUBLIC_API_URL`.

- [ ] **Step 1: Создать проект**

```bash
cd ~/Desktop/Work
npx create-next-app@latest Toc2me-Harness \
  --ts --app --no-tailwind --no-src-dir --no-eslint --use-npm --no-turbopack
cd Toc2me-Harness
npm i -D vitest
rm -f app/page.module.css public/*.svg
```

- [ ] **Step 2: Настроить окружение и скрипты**

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

В `package.json` в `scripts` добавить:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
```

- [ ] **Step 3: Стили**

Заменить `app/globals.css` целиком:

```css
:root {
  --bg: #101418;
  --panel: #171d23;
  --panel-2: #1e262e;
  --line: #2b353e;
  --ink: #e6edf3;
  --ink-dim: #93a1ad;
  --accent: #5dc4a6;
  --warn: #e0a35c;
  --bad: #e2705c;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
  --sans: -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.55 var(--sans);
}

a { color: var(--accent); }

nav.top {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: .7rem 1rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 5;
}

nav.top .who { margin-left: auto; font-family: var(--mono); font-size: 12px; color: var(--ink-dim); }

main { max-width: 900px; margin: 0 auto; padding: 1.2rem 1rem 4rem; }

h1 { font-size: 1.4rem; margin: 0 0 1rem; }
h2 { font-size: 1.05rem; margin: 1.6rem 0 .6rem; }

section.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

label { display: block; font-size: 12px; color: var(--ink-dim); margin: .5rem 0 .2rem; }

input, textarea, select {
  width: 100%;
  background: var(--panel-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: .45rem .55rem;
  font: 13px/1.4 var(--sans);
}

textarea { min-height: 4.5rem; resize: vertical; }

button {
  background: var(--accent);
  color: #06231c;
  border: 0;
  border-radius: 4px;
  padding: .45rem .8rem;
  font: 600 13px var(--sans);
  cursor: pointer;
}

button.ghost { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); }
button:disabled { opacity: .5; cursor: default; }

.row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
.dim { color: var(--ink-dim); font-size: 12px; }
.mono { font-family: var(--mono); font-size: 12px; }

.errorbar {
  position: sticky;
  top: 0;
  background: #3a1d19;
  border: 1px solid var(--bad);
  color: #ffd9d1;
  padding: .5rem .7rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-family: var(--mono);
  font-size: 12px;
  display: flex;
  gap: .6rem;
  align-items: flex-start;
}

.banner { background: #3a3119; border-color: var(--warn); color: #ffe9c7; }

details.raw { margin-top: .6rem; }
details.raw > summary { cursor: pointer; font-size: 12px; color: var(--ink-dim); }
details.raw pre {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: .6rem;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 11.5px;
  max-height: 22rem;
}

/* chat */
.bubbles { display: flex; flex-direction: column; gap: .5rem; }
.bubble { max-width: 78%; padding: .5rem .7rem; border-radius: 10px; background: var(--panel-2); }
.bubble.mine { align-self: flex-end; background: #1f4a40; }
.bubble.ai { align-self: flex-start; border: 1px solid var(--accent); }
.bubble.system { align-self: center; background: transparent; border: 1px dashed var(--warn); color: #ffe9c7; font-size: 12.5px; }
.bubble.draft { align-self: flex-start; border: 1px dashed var(--accent); opacity: .85; }
.bubble .meta { font-size: 10.5px; color: var(--ink-dim); margin-top: .25rem; font-family: var(--mono); }

.status { font-family: var(--mono); font-size: 11.5px; }
.status.open { color: var(--accent); }
.status.closed { color: var(--bad); }
.status.connecting { color: var(--warn); }

video { width: 100%; max-height: 60vh; background: #000; border-radius: 6px; }

table.log { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11.5px; }
table.log td, table.log th { border-bottom: 1px solid var(--line); padding: .3rem .5rem; text-align: left; vertical-align: top; }
```

- [ ] **Step 4: Общие компоненты**

`components/ErrorBar.tsx`:

```tsx
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
```

`components/RawJson.tsx`:

```tsx
"use client";

/** Every screen carries one: the client must be able to see the real payload. */
export function RawJson({ value, label = "сырой JSON" }: { value: unknown; label?: string }) {
  return (
    <details className="raw">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
```

- [ ] **Step 5: Каркас страницы**

`app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Toc2me — тестовый стенд" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` — временная заглушка, её заменит Task 5:

```tsx
"use client";

export default function Home() {
  return (
    <main>
      <h1>Toc2me — тестовый стенд</h1>
      <p className="dim">Каркас готов. Вход появится в Task 5.</p>
    </main>
  );
}
```

- [ ] **Step 6: Проверить сборку и запуск**

```bash
npm run build
npm run dev
```

Expected: `build` без ошибок; `http://localhost:3000` открывается на тёмном фоне с заголовком. Порт обязан быть 3000 — если он занят, освободить, а не менять (порт прошит в CORS бэкенда).

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "chore: scaffold the Next.js test harness"
```

---

## Task 4: Типы и транспорт

**Files:**
- Create: `lib/types.ts`, `lib/api.ts`, `lib/demo.ts`
- Test: `lib/api.test.ts`

**Interfaces:**
- Produces: `api<T>(path, init?): Promise<T>`, `parseError(status, statusText, body): ApiError`, `isApiError(e)`, `API`, все типы DTO, `DEMO`.

- [ ] **Step 1: Зеркало DTO бэкенда**

`lib/types.ts`:

```ts
export type Role = "USER" | "CREATOR" | "AGENCY" | "ADMIN";
export type AssetType = "IMAGE" | "VIDEO" | "AUDIO" | "TEXT";
export type AssetStatus = "DRAFT" | "UPLOADING" | "PROCESSING" | "ACTIVE" | "ARCHIVED";
export type ModerationState = "CLEAN" | "FLAGGED" | "BLOCKED";
export type SenderType = "USER" | "AI" | "SYSTEM";
export type SwipeDirection = "SAVE" | "SKIP";

export type UserDto = {
  id: number;
  name: string | null;
  email: string;
  age: number | null;
  location: string | null;
  role: Role;
};

export type AssetResponse = {
  id: number;
  creatorId: number;
  type: AssetType;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  status: AssetStatus;
  title: string | null;
  description: string | null;
  tags: string | null;
  aiContext: string | null;
  creatorDisplayName: string | null;
  creatorAvatarUrl: string | null;
  policyFlags: string | null;
  ageGateRequired: boolean;
  moderationState: ModerationState;
  createdAt: string;
  updatedAt: string | null;
};

export type ConversationResponse = {
  id: number;
  partnerId: number;
  partnerName: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
  personaEnabled: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
};

export type MessageResponse = {
  id: number;
  conversationId: number;
  senderId: number | null;
  senderType: SenderType;
  type: "TEXT";
  body: string;
  contextAssetId: number | null;
  readAt: string | null;
  createdAt: string;
};

export type PersonaRequest = {
  displayName: string;
  description?: string | null;
  tonality?: string | null;
  topics?: string | null;
  boundaries?: string | null;
  greeting?: string | null;
  avatarAssetId?: number | null;
  enabled?: boolean | null;
};

export type PersonaResponse = PersonaRequest & {
  id: number;
  creatorId: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type PresignedPart = { partNumber: number; url: string };

export type UploadInitResponse = {
  assetId: number;
  /** null for a single-shot upload: the file fits one plain PUT */
  uploadId: string | null;
  contentType: string;
  partSize: number;
  partCount: number;
  parts: PresignedPart[];
};

export type InterestResponse = { id: number; name: string };
export type FavoriteCreatorResponse = { creatorId: number; creatorEmail: string; favoritedAt: string };
export type SwipeResponse = { assetId: number; direction: SwipeDirection; creatorFavorited: boolean };

/** Spring Data page, trimmed to the fields the harness reads. */
export type Page<T> = {
  content: T[];
  number: number;
  totalPages: number;
  totalElements: number;
};
```

- [ ] **Step 2: Написать падающий тест на разбор ошибок**

`lib/api.test.ts`:

```ts
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
```

- [ ] **Step 3: Запустить и убедиться в падении**

Run: `npm test`
Expected: FAIL — `./api` не существует.

- [ ] **Step 4: Транспорт**

`lib/api.ts`:

```ts
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
```

- [ ] **Step 5: Демо-креды**

`lib/demo.ts`:

```ts
/** Accounts created by Toc2meBack/scripts/seed-demo-users.sql. */
export const DEMO = {
  user: { email: "user@demo.local", password: "demo1234" },
  creator: { email: "creator@demo.local", password: "demo1234" },
} as const;
```

- [ ] **Step 6: Запустить и убедиться в прохождении**

Run: `npm test`
Expected: PASS, 3 теста.

- [ ] **Step 7: Коммит**

```bash
git add lib components
git commit -m "feat: typed API transport with credentialed fetch"
```

---

## Task 5: Сессия и экран входа

**Files:**
- Create: `lib/session.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `api`, `send`, `UserDto`, `DEMO`, `ErrorBar`, `RawJson`.
- Produces: `SessionProvider`, `useSession(): { user, loading, error, clearError, login(email, password), refresh(), becomeCreator() }`.

- [ ] **Step 1: Слой сессии**

`lib/session.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, isApiError, send, type ApiError } from "./api";
import type { UserDto } from "./types";

type SessionValue = {
  user: UserDto | null;
  loading: boolean;
  error: ApiError | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  refresh: () => Promise<void>;
  becomeCreator: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<UserDto>("/api/user/me"));
    } catch (e) {
      // 401 just means "not signed in" — not an error worth showing
      if (isApiError(e) && e.status === 401) setUser(null);
      else if (isApiError(e)) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        // the backend sets the httpOnly cookie on this response; we never see the token
        await send<{ token: string }>("POST", "/auth/login", { email, password });
        await refresh();
      } catch (e) {
        if (isApiError(e)) setError(e);
      }
    },
    [refresh],
  );

  const becomeCreator = useCallback(async () => {
    setError(null);
    try {
      await send("POST", "/api/user/become-creator");
      await refresh();
    } catch (e) {
      if (isApiError(e)) setError(e);
    }
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ user, loading, error, clearError: () => setError(null), login, refresh, becomeCreator }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
```

Обратите внимание: метода `logout` **нет**, и это не пропуск. В бэкенде нет `/auth/logout`, а кука `httpOnly` — из JS её не удалить. Сменить личность можно только входом под другим аккаунтом (login перезаписывает куку). Полный выход — очистка кук в devtools. Это написано на экране в Step 3.

- [ ] **Step 2: Подключить провайдер и навигацию**

`app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = { title: "Toc2me — тестовый стенд" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SessionProvider>
          <Nav />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

`components/Nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

export function Nav() {
  const { user } = useSession();
  return (
    <nav className="top">
      <Link href="/">вход</Link>
      <Link href="/feed">лента</Link>
      <Link href="/studio">студия</Link>
      <Link href="/chats">чаты</Link>
      <Link href="/debug">debug</Link>
      <span className="who">
        {user ? `#${user.id} ${user.email} · ${user.role}` : "не в системе"}
      </span>
    </nav>
  );
}
```

- [ ] **Step 3: Экран входа**

`app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { DEMO } from "@/lib/demo";
import { useSession } from "@/lib/session";
import type { InterestResponse } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

export default function Home() {
  const { user, loading, error, clearError, login, refresh, becomeCreator } = useSession();
  const [email, setEmail] = useState(DEMO.user.email);
  const [password, setPassword] = useState(DEMO.user.password);

  return (
    <main>
      <ErrorBar error={error} onClear={clearError} />
      <h1>Тестовый стенд Toc2me</h1>
      <p className="dim">
        Две личности — два окна: обычное для зрителя, инкогнито для автора. Кука одна на хост,
        поэтому в двух обычных окнах вход перезатрёт сам себя.
      </p>

      <section className="card">
        <h2>Вход</h2>
        <div className="row">
          <button onClick={() => login(DEMO.user.email, DEMO.user.password)}>
            войти как зритель
          </button>
          <button onClick={() => login(DEMO.creator.email, DEMO.creator.password)}>
            войти как автор
          </button>
        </div>
        <div className="grid2" style={{ marginTop: ".8rem" }}>
          <div>
            <label>email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label>пароль</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button className="ghost" onClick={() => login(email, password)}>
            войти
          </button>
          <span className="dim">
            выхода нет: в бэкенде нет /auth/logout, а кука httpOnly. Смена личности — вход под
            другим аккаунтом; полный выход — очистить куки в devtools.
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Кто я</h2>
        {loading ? (
          <p className="dim">загрузка…</p>
        ) : user ? (
          <>
            <p className="mono">
              #{user.id} · {user.email} · {user.role}
            </p>
            <div className="row">
              <button className="ghost" onClick={() => void refresh()}>
                обновить
              </button>
              {user.role === "USER" && <button onClick={() => void becomeCreator()}>стать автором</button>}
            </div>
            <RawJson value={user} />
          </>
        ) : (
          <p className="dim">не в системе</p>
        )}
      </section>

      {user && <Profile />}
      <Interests enabled={!!user} />
      <Registration />
    </main>
  );
}

function Profile() {
  const { user, refresh } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState(user?.age?.toString() ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [err, setErr] = useState<ApiError | null>(null);

  async function save() {
    setErr(null);
    try {
      // this is why GET /api/user/me exists: the path needs an id the token never carries
      await send("PATCH", `/api/user/update/${user!.id}`, {
        name,
        age: age ? Number(age) : null,
        location,
      });
      await refresh();
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <section className="card">
      <h2>Профиль</h2>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <div className="grid2">
        <div>
          <label>имя</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>возраст</label>
          <input value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>
      <label>город</label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button onClick={() => void save()}>сохранить</button>
      </div>
    </section>
  );
}

function Interests({ enabled }: { enabled: boolean }) {
  const [all, setAll] = useState<InterestResponse[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<InterestResponse[]>("/api/interests")
      .then(setAll)
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  async function save() {
    setErr(null);
    setSaved(false);
    try {
      await send("POST", "/api/user/interests", { interestIds: picked });
      setSaved(true);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <section className="card">
      <h2>Интересы</h2>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      {all.length === 0 && <p className="dim">пусто — прогони seed-demo-users.sql</p>}
      <div className="row">
        {all.map((i) => (
          <label key={i.id} className="row" style={{ width: "auto", gap: ".3rem" }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={picked.includes(i.id)}
              onChange={(e) =>
                setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))
              }
            />
            {i.name}
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button disabled={!enabled} onClick={() => void save()}>
          сохранить
        </button>
        {saved && <span className="dim">сохранено</span>}
      </div>
      <RawJson value={all} label="GET /api/interests" />
    </section>
  );
}

function Registration() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("demo1234");
  const [token, setToken] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setErr(null);
    setNote(null);
    try {
      await fn();
      setNote(ok);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <details className="card">
      <summary>Регистрация с подтверждением (обычно не нужна — аккаунты засеяны)</summary>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <div className="grid2" style={{ marginTop: ".6rem" }}>
        <div>
          <label>email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label>пароль</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button
          className="ghost"
          onClick={() =>
            void run(
              () => send("POST", "/auth/register", { email, password, role: "USER" }),
              "письмо отправлено",
            )
          }
        >
          зарегистрировать
        </button>
        <button
          className="ghost"
          onClick={() =>
            void run(() => send("POST", "/auth/resend-confirmation", { email }), "письмо переотправлено")
          }
        >
          переотправить письмо
        </button>
      </div>
      <label>token из письма</label>
      <input value={token} onChange={(e) => setToken(e.target.value)} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button
          className="ghost"
          onClick={() =>
            void run(
              () => api(`/auth/confirm?token=${encodeURIComponent(token)}`),
              "email подтверждён",
            )
          }
        >
          подтвердить
        </button>
        {note && <span className="dim">{note}</span>}
      </div>
      <p className="dim">
        Ссылка в письме ведёт на <span className="mono">localhost:3000/app/…</span> —
        стенд такого роута не имеет, поэтому token надо скопировать из адресной строки вручную.
      </p>
    </details>
  );
}
```

- [ ] **Step 4: Проверить руками**

Бэкенд запущен, seed прогнан. `npm run dev`, открыть `http://localhost:3000`:

1. «войти как зритель» → в шапке появляется `#N user@demo.local · USER`;
2. «сохранить» в профиле → 200, после «обновить» имя изменилось;
3. интересы показывают пять штук, сохранение отвечает без ошибки;
4. «войти как автор» → шапка сменилась на `CREATOR` (та же кука перезаписана);
5. в devtools → Application → Cookies видна `access_token`, `HttpOnly`, `Max-Age` около 86400.

Expected: все пять пунктов. Если `/api/user/me` даёт 404 — Task 1 не задеплоен, перезапустить бэкенд.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "feat: session context and the sign-in screen"
```

---

## Task 6: События и сборка ответа

Самая хитрая часть стенда: ответ персоны приходит и токенами, и отдельным `message`-событием, а черновой пузырь обязан сниматься в любом исходе. Поэтому — чистая функция под тестами.

**Files:**
- Create: `lib/events.ts`, `lib/reply-reducer.ts`
- Test: `lib/reply-reducer.test.ts`

**Interfaces:**
- Consumes: `MessageResponse`.
- Produces: `EV`, `StreamEvent`, `ChatState`, `emptyState(conversationId)`, `reduce(state, ev)`.

- [ ] **Step 1: Имена и типы событий**

`lib/events.ts`:

```ts
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
```

- [ ] **Step 2: Написать падающие тесты**

`lib/reply-reducer.test.ts`:

```ts
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
    s = reduce(s, { event: "token", data: { conversationId: 7, replyId: "a1", delta: "В " } });
    s = reduce(s, { event: "token", data: { conversationId: 7, replyId: "a1", delta: "Вене" } });

    expect(s.drafts.a1).toBe("В Вене");
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
```

- [ ] **Step 3: Запустить и убедиться в падении**

Run: `npm test`
Expected: FAIL — `./reply-reducer` не существует.

- [ ] **Step 4: Реализовать редьюсер**

`lib/reply-reducer.ts`:

```ts
import type { StreamEvent } from "./events";
import type { MessageResponse } from "./types";

export type ChatState = {
  conversationId: number;
  /** ascending by createdAt */
  messages: MessageResponse[];
  /** replyId → text accumulated so far */
  drafts: Record<string, string>;
  /** last error reason: ai_unavailable | rate_limited | internal */
  banner: string | null;
};

export function emptyState(conversationId: number): ChatState {
  return { conversationId, messages: [], drafts: {}, banner: null };
}

function withoutDraft(drafts: Record<string, string>, replyId: string): Record<string, string> {
  const next = { ...drafts };
  delete next[replyId];
  return next;
}

export function reduce(state: ChatState, ev: StreamEvent): ChatState {
  // one stream serves every conversation; the screen only wants its own
  if (ev.data.conversationId !== state.conversationId) return state;

  switch (ev.event) {
    case "message": {
      // the persona's reply arrives twice — as tokens and as its own message event
      if (state.messages.some((m) => m.id === ev.data.id)) return state;
      const messages = [...state.messages, ev.data].sort((a, b) =>
        a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1,
      );
      return { ...state, messages };
    }
    case "reply-start":
      return { ...state, banner: null, drafts: { ...state.drafts, [ev.data.replyId]: "" } };
    case "token":
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [ev.data.replyId]: (state.drafts[ev.data.replyId] ?? "") + ev.data.delta,
        },
      };
    case "reply-end":
      // messageId null means the model refused: drop the draft, a SYSTEM message follows
      return { ...state, drafts: withoutDraft(state.drafts, ev.data.replyId) };
    case "error":
      return {
        ...state,
        banner: ev.data.reason,
        drafts: ev.data.replyId ? withoutDraft(state.drafts, ev.data.replyId) : {},
      };
  }
}

/** Merges a page of history into the state, keeping the uniqueness and ordering rules. */
export function withHistory(state: ChatState, page: MessageResponse[]): ChatState {
  return page.reduce((acc, m) => reduce(acc, { event: "message", data: m }), state);
}
```

- [ ] **Step 5: Запустить и убедиться в прохождении**

Run: `npm test`
Expected: PASS, 10 тестов (3 из Task 4 + 7 здесь).

- [ ] **Step 6: Коммит**

```bash
git add lib
git commit -m "feat: stream event types and the reply reducer"
```

---

## Task 7: SSE-стрим и экран debug

**Files:**
- Create: `lib/stream.tsx`, `app/debug/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `EV_NAMES`, `StreamEvent`, `API`, `useSession`.
- Produces: `StreamProvider`, `useStream(): { status, log, subscribe(listener), reconnect() }`.

- [ ] **Step 1: Контекст стрима**

`lib/stream.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API } from "./api";
import { EV_NAMES, type StreamEvent } from "./events";
import { useSession } from "./session";

export type LogEntry = { at: number; event: string; data: unknown };
type Listener = (ev: StreamEvent) => void;

type StreamValue = {
  status: "idle" | "connecting" | "open" | "closed";
  log: LogEntry[];
  subscribe: (l: Listener) => () => void;
  reconnect: () => void;
};

const Ctx = createContext<StreamValue | null>(null);
const LOG_LIMIT = 200;

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [status, setStatus] = useState<StreamValue["status"]>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [attempt, setAttempt] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    // the braces matter: Set.delete returns a boolean, and a cleanup function must return void
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");

    // EventSource cannot set an Authorization header — which is exactly why the backend
    // accepts the cookie. withCredentials is what sends it cross-port.
    const es = new EventSource(`${API}/api/chat/stream`, { withCredentials: true });

    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("closed");

    const handlers = EV_NAMES.map((name) => {
      const handler = (raw: MessageEvent) => {
        const data = JSON.parse(raw.data);
        setLog((l) => [{ at: Date.now(), event: name, data }, ...l].slice(0, LOG_LIMIT));
        const ev = { event: name, data } as StreamEvent;
        listeners.current.forEach((l) => l(ev));
      };
      es.addEventListener(name, handler as EventListener);
      return { name, handler };
    });

    return () => {
      handlers.forEach(({ name, handler }) => es.removeEventListener(name, handler as EventListener));
      es.close();
      setStatus("closed");
    };
  }, [user, attempt]);

  return (
    <Ctx.Provider value={{ status, log, subscribe, reconnect: () => setAttempt((a) => a + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStream(): StreamValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useStream outside StreamProvider");
  return value;
}
```

- [ ] **Step 2: Обернуть приложение**

В `app/layout.tsx` добавить импорт `import { StreamProvider } from "@/lib/stream";` и вложить его **внутрь** `SessionProvider` (стрим открывается только когда известно, кто мы):

```tsx
        <SessionProvider>
          <StreamProvider>
            <Nav />
            {children}
          </StreamProvider>
        </SessionProvider>
```

- [ ] **Step 3: Экран debug**

`app/debug/page.tsx`:

```tsx
"use client";

import { useStream } from "@/lib/stream";

export default function Debug() {
  const { status, log, reconnect } = useStream();

  return (
    <main>
      <h1>Журнал стрима</h1>
      <section className="card">
        <div className="row">
          <span className={`status ${status}`}>GET /api/chat/stream — {status}</span>
          <button className="ghost" onClick={reconnect}>
            переподключить
          </button>
          <span className="dim">
            heartbeat раз в 20 секунд приходит SSE-комментарием и в журнал не попадает — это
            нормально, признак живого соединения здесь только статус
          </span>
        </div>
      </section>

      <section className="card">
        {log.length === 0 && <p className="dim">пока ничего не приходило</p>}
        <table className="log">
          <tbody>
            {log.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td>{new Date(e.at).toLocaleTimeString()}</td>
                <td>{e.event}</td>
                <td>
                  <pre style={{ margin: 0 }}>{JSON.stringify(e.data)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Проверить руками**

`npm run dev`, войти как зритель, открыть `/debug`.

Expected: статус `open` зелёным. В логе бэкенда не должно быть 401. Если статус `closed` — проверить, что бэкенд запущен и что порт стенда именно 3000 (иначе CORS отклонит запрос с credentials).

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "feat: SSE stream context and the debug log"
```

---

## Task 8: Прямая загрузка ассетов

**Files:**
- Create: `lib/upload.ts`
- Test: `lib/upload.test.ts`

**Interfaces:**
- Consumes: `api`, `send`, `UploadInitResponse`, `AssetResponse`, `AssetType`.
- Produces: `planParts(file, partSize): Blob[]`, `uploadAsset(file, type, onProgress, onStart?): Promise<AssetResponse>`, `cancelUpload(assetId)`, `uploadSmall(file, type)`.

- [ ] **Step 1: Написать падающие тесты нарезки**

`lib/upload.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `npm test`
Expected: FAIL — `./upload` не существует.

- [ ] **Step 3: Реализовать загрузку**

`lib/upload.ts`:

```ts
import { api, send } from "./api";
import type { AssetResponse, AssetType, PresignedPart, UploadInitResponse } from "./types";

const CONCURRENCY = 3;

/**
 * Part n covers bytes [(n-1) * partSize, n * partSize). Pure, so the boundaries are
 * testable without a network: an off-by-one here corrupts the assembled object.
 */
export function planParts(file: Blob, partSize: number): Blob[] {
  const parts: Blob[] = [];
  for (let start = 0; start < file.size; start += partSize) {
    parts.push(file.slice(start, Math.min(start + partSize, file.size)));
  }
  return parts.length > 0 ? parts : [file.slice(0, 0)];
}

async function putPart(part: PresignedPart, body: Blob, contentType: string): Promise<string> {
  // Always send Content-Type: for a single-shot upload the store signed that header into
  // the URL and answers 403 for anything else; for multipart parts it is ignored.
  const res = await fetch(part.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) throw Object.assign(new Error(`part ${part.partNumber}: ${res.status}`), {
    status: res.status,
    partNumber: part.partNumber,
  });

  const etag = res.headers.get("ETag");
  if (!etag) {
    throw new Error(
      `part ${part.partNumber}: no ETag header. The store must expose it to JS — check CORS exposedHeaders.`,
    );
  }
  return etag;
}

/**
 * Three steps, exactly as docs/media-upload.md describes: reserve, PUT the bytes, complete.
 * Nothing branches on the environment — in dev the URLs point at the app's own signed
 * /api/content/uploads/direct instead of the bucket.
 */
export async function uploadAsset(
  file: File,
  type: AssetType,
  onProgress: (done: number, total: number) => void,
  /** Called once the asset row exists, so the caller can offer to cancel it. */
  onStart?: (assetId: number) => void,
): Promise<AssetResponse> {
  const plan = await send<UploadInitResponse>("POST", "/api/content/uploads", {
    type,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });
  onStart?.(plan.assetId);

  const blobs = planParts(file, plan.partSize);
  const etags: Record<number, string> = {};
  let done = 0;

  async function upload(index: number): Promise<void> {
    const part = plan.parts[index];
    const body = blobs[index];
    try {
      etags[part.partNumber] = await putPart(part, body, plan.contentType);
    } catch (e) {
      // an expired URL answers 403; ask for a fresh one and try once more
      if ((e as { status?: number }).status !== 403) throw e;
      const [fresh] = await send<PresignedPart[]>(
        "POST",
        `/api/content/uploads/${plan.assetId}/parts`,
        { partNumbers: [part.partNumber] },
      );
      etags[part.partNumber] = await putPart(fresh, body, plan.contentType);
    }
    onProgress(++done, plan.parts.length);
  }

  const queue = plan.parts.map((_, i) => i);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) await upload(i);
    }),
  );

  // complete is called even for a single-shot upload: the backend handles a null uploadId
  return send<AssetResponse>("POST", `/api/content/uploads/${plan.assetId}/complete`, {
    parts: Object.entries(etags).map(([partNumber, etag]) => ({
      partNumber: Number(partNumber),
      etag,
    })),
  });
}

/** Aborts the multipart upload and discards whatever landed. */
export function cancelUpload(assetId: number): Promise<void> {
  return api<void>(`/api/content/uploads/${assetId}`, { method: "DELETE" });
}

/** The proxied path: every byte goes through the app. Fine for avatars and thumbnails. */
export function uploadSmall(file: File, type: AssetType): Promise<AssetResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  return api<AssetResponse>("/api/content/upload", { method: "POST", body: form });
}
```

- [ ] **Step 4: Запустить и убедиться в прохождении**

Run: `npm test`
Expected: PASS, 13 тестов.

- [ ] **Step 5: Коммит**

```bash
git add lib
git commit -m "feat: direct three-step asset upload"
```

---

## Task 9: Студия автора

**Files:**
- Create: `app/studio/page.tsx`

**Interfaces:**
- Consumes: `api`, `send`, `uploadAsset`, `uploadSmall`, `cancelUpload`, `useSession`, `PersonaResponse`, `AssetResponse`, `Page`.
- Produces: экран `/studio`.

- [ ] **Step 1: Написать экран**

`app/studio/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cancelUpload, uploadAsset, uploadSmall } from "@/lib/upload";
import type { AssetResponse, Page, PersonaRequest, PersonaResponse } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

export default function Studio() {
  const { user } = useSession();
  const [err, setErr] = useState<ApiError | null>(null);

  if (!user) return <main><p className="dim">Сначала войдите.</p></main>;

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>Студия автора</h1>
      {user.role !== "CREATOR" && (
        <section className="card">
          <p className="dim">
            Вы вошли как {user.role}. Загрузка и персона закрыты <span className="mono">@PreAuthorize</span>,
            и бэкенд намеренно отвечает глухим <span className="mono">403 access denied</span> — причину
            он пишет только в свой лог. Это не поломка стенда: нажмите «стать автором» на главной.
          </p>
        </section>
      )}
      <Persona onError={setErr} />
      <Uploader onError={setErr} />
    </main>
  );
}

function Persona({ onError }: { onError: (e: ApiError) => void }) {
  const [form, setForm] = useState<PersonaRequest>({ displayName: "", enabled: true });
  const [saved, setSaved] = useState<PersonaResponse | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    api<PersonaResponse>("/api/persona")
      .then((p) => {
        setSaved(p);
        setForm(p);
      })
      // a creator who has no persona yet gets 400 from getOwnPersona, not 404 — neither is
      // worth a red bar on first open
      .catch((e) => isApiError(e) && ![400, 404].includes(e.status) && onError(e));
  }, [onError]);

  function field(key: keyof PersonaRequest) {
    return {
      value: (form[key] as string) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function save() {
    try {
      const p = await send<PersonaResponse>("PUT", "/api/persona", form);
      setSaved(p);
      setForm(p);
    } catch (e) {
      if (isApiError(e)) onError(e);
    }
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    try {
      // the proxied endpoint on purpose: an avatar is small, and this covers the second path
      const asset = await uploadSmall(file, "IMAGE");
      setForm((f) => ({ ...f, avatarAssetId: asset.id }));
    } catch (e) {
      if (isApiError(e)) onError(e);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Персона</h2>
      <p className="dim">
        Без включённой персоны AI не отвечает вообще: <span className="mono">AiReplyService</span> выходит
        сразу, если <span className="mono">findByCreatorIdAndEnabledTrue</span> ничего не нашёл.
      </p>
      <label>отображаемое имя *</label>
      <input {...field("displayName")} />
      <label>описание характера</label>
      <textarea {...field("description")} />
      <label>тон и стиль</label>
      <textarea {...field("tonality")} />
      <label>любимые темы</label>
      <textarea {...field("topics")} />
      <label>запретные темы (жёсткие границы)</label>
      <textarea {...field("boundaries")} />
      <label>приветствие (первое сообщение AI при открытии диалога)</label>
      <textarea {...field("greeting")} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <label className="row" style={{ width: "auto", gap: ".3rem" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={!!form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          включена
        </label>
        <span className="dim">аватар: {form.avatarAssetId ?? "нет"}</span>
        <input
          type="file"
          accept="image/*"
          style={{ width: "auto" }}
          disabled={avatarBusy}
          onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])}
        />
      </div>
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button onClick={() => void save()}>сохранить персону</button>
      </div>
      {saved && <RawJson value={saved} label="GET /api/persona" />}
    </section>
  );
}

function Uploader({ onError }: { onError: (e: ApiError) => void }) {
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(() => {
    api<Page<AssetResponse>>("/api/content?size=20&sort=createdAt,desc")
      .then((p) => setAssets(p.content))
      .catch((e) => isApiError(e) && onError(e));
  }, [onError]);

  useEffect(load, [load]);

  async function pick(file: File) {
    setProgress("план…");
    try {
      const asset = await uploadAsset(
        file,
        "VIDEO",
        (done, total) => setProgress(`часть ${done}/${total}`),
        // the asset row exists from here on: a half-finished upload can be aborted
        (assetId) => setPending(assetId),
      );
      setProgress(`готово: #${asset.id}, статус ${asset.status}`);
      setPending(null);
      load();
    } catch (e) {
      setProgress(null);
      // a failed PUT leaves `pending` set on purpose, so the cancel button stays reachable
      if (isApiError(e)) onError(e);
      else onError({ status: 0, error: "upload", message: (e as Error).message });
    }
  }

  return (
    <>
      <section className="card">
        <h2>Загрузка видео</h2>
        <p className="dim">
          Три шага: план с подписанными URL → PUT частей по 8 МБ → complete с ETag. В дев-режиме
          файлы ложатся на диск тем же путём, что в проде — в R2.
        </p>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])}
        />
        {progress && <p className="mono">{progress}</p>}
        {pending && (
          <button className="ghost" onClick={() => void cancelUpload(pending).then(load)}>
            отменить загрузку #{pending}
          </button>
        )}
      </section>

      <section className="card">
        <h2>Мои ассеты</h2>
        {assets.length === 0 && <p className="dim">пусто</p>}
        {assets.map((a) => (
          <AssetRow key={a.id} asset={a} onChanged={load} onError={onError} />
        ))}
      </section>
    </>
  );
}

function AssetRow({
  asset,
  onChanged,
  onError,
}: {
  asset: AssetResponse;
  onChanged: () => void;
  onError: (e: ApiError) => void;
}) {
  const [title, setTitle] = useState(asset.title ?? "");
  const [aiContext, setAiContext] = useState(asset.aiContext ?? "");
  const [tags, setTags] = useState(asset.tags ?? "");
  const [fetched, setFetched] = useState<AssetResponse | null>(null);

  // the list came from GET /api/content; this exercises the single-asset endpoint too,
  // which is the one the feed and the chat rely on
  async function reload() {
    try {
      setFetched(await api<AssetResponse>(`/api/content/${asset.id}`));
    } catch (e) {
      if (isApiError(e)) onError(e);
    }
  }

  async function save() {
    try {
      await send("PATCH", `/api/content/${asset.id}/metadata`, {
        title,
        description: asset.description,
        tags,
        aiContext,
      });
      onChanged();
    } catch (e) {
      if (isApiError(e)) onError(e);
    }
  }

  async function remove() {
    try {
      await api(`/api/content/${asset.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      if (isApiError(e)) onError(e);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: ".8rem", marginTop: ".8rem" }}>
      <p className="mono">
        #{asset.id} · {asset.type} · {asset.status} · {asset.moderationState}
      </p>
      {asset.fileUrl && asset.status === "ACTIVE" && <video src={asset.fileUrl} controls preload="metadata" />}
      <label>заголовок</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>теги</label>
      <input value={tags} onChange={(e) => setTags(e.target.value)} />
      <label>aiContext — что персона знает про этот клип</label>
      <textarea value={aiContext} onChange={(e) => setAiContext(e.target.value)} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button onClick={() => void save()}>сохранить метаданные</button>
        <button className="ghost" onClick={() => void reload()}>
          перечитать одним запросом
        </button>
        <button className="ghost" onClick={() => void remove()}>
          удалить
        </button>
      </div>
      <RawJson value={asset} label="строка из GET /api/content" />
      {fetched && <RawJson value={fetched} label={`GET /api/content/${asset.id}`} />}
    </div>
  );
}
```

- [ ] **Step 2: Проверить руками**

Войти автором (инкогнито или на главной), открыть `/studio`:

1. персона подгрузилась из seed (`Anna`), правка сохраняется;
2. загрузить mp4 из папки `Toc2meBack/video/` → прогресс по частям → статус `ACTIVE` и `fileUrl`;
3. видео проигрывается в `<video>` — значит подписанный URL работает без заголовка `Authorization`;
4. заполнить `aiContext` — например «Съёмка в танцевальной студии в Вене, февраль, репетиция перед конкурсом»; сохранить;
5. загрузить картинку в аватар → в поле появился id, «сохранить персону» → 200.

Expected: все пять. Если PUT части падает с «no ETag header» — бэкенд не отдаёт `ETag` в `exposedHeaders`; проверить `SecurityConfig.corsConfigurationSource`.

- [ ] **Step 3: Коммит**

```bash
git add -A
git commit -m "feat: creator studio — persona, upload, asset metadata"
```

---

## Task 10: Лента

**Files:**
- Create: `app/feed/page.tsx`, `lib/seen-assets.ts`

**Interfaces:**
- Consumes: `api`, `send`, `AssetResponse`, `Page`, `SwipeResponse`, `FavoriteCreatorResponse`.
- Produces: экран `/feed`; `rememberAsset(asset)`, `seenAssets(): AssetResponse[]`.

- [ ] **Step 1: Память об увиденных клипах**

Зачем: чтобы приложить клип к сообщению, нужен его `assetId`, а `GET /api/content` отдаёт только **свои** ассеты. Клипы чужого автора клиент видит лишь в ленте — значит их надо запомнить там.

`lib/seen-assets.ts`:

```ts
import type { AssetResponse } from "./types";

const KEY = "toc2me.seenAssets";
const LIMIT = 20;

/**
 * Clips seen in the feed, kept so the chat screen can offer them as context.
 *
 * There is no endpoint that lists another creator's assets — GET /api/content is "mine"
 * only — so the feed is the sole place a viewer ever learns an assetId.
 */
export function rememberAsset(asset: AssetResponse): void {
  if (typeof window === "undefined") return;
  const kept = seenAssets().filter((a) => a.id !== asset.id);
  sessionStorage.setItem(KEY, JSON.stringify([asset, ...kept].slice(0, LIMIT)));
}

export function seenAssets(): AssetResponse[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as AssetResponse[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Экран ленты**

`app/feed/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { rememberAsset } from "@/lib/seen-assets";
import type {
  AssetResponse,
  ConversationResponse,
  FavoriteCreatorResponse,
  Page,
  SwipeDirection,
  SwipeResponse,
} from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

export default function Feed() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [index, setIndex] = useState(0);
  const [favorites, setFavorites] = useState<FavoriteCreatorResponse[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const loadFavorites = useCallback(() => {
    api<Page<FavoriteCreatorResponse>>("/api/feed/favorites")
      .then((p) => setFavorites(p.content))
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  useEffect(() => {
    api<Page<AssetResponse>>("/api/feed?size=20")
      .then((p) => setAssets(p.content))
      .catch((e) => isApiError(e) && setErr(e));
    loadFavorites();
  }, [loadFavorites]);

  const current = assets[index];

  useEffect(() => {
    if (current) rememberAsset(current);
  }, [current]);

  async function swipe(direction: SwipeDirection) {
    if (!current) return;
    setNote(null);
    try {
      const res = await send<SwipeResponse>("POST", "/api/feed/swipe", {
        assetId: current.id,
        direction,
      });
      setNote(res.creatorFavorited ? "автор добавлен в избранное" : `свайп ${direction} записан`);
      if (direction === "SAVE") loadFavorites();
    } catch (e) {
      // swiping the same asset twice is a 400 by design — show it, do not treat it as a crash
      if (isApiError(e)) setErr(e);
    } finally {
      setIndex((i) => i + 1);
    }
  }

  async function write() {
    if (!current) return;
    try {
      const conversation = await send<ConversationResponse>("POST", "/api/chat/conversations", {
        creatorId: current.creatorId,
        assetId: current.id,
      });
      router.push(`/chats/${conversation.id}?assetId=${current.id}`);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>Лента</h1>

      <section className="card">
        {!current ? (
          <p className="dim">
            Клипы закончились. Лента отдаёт только чужие видео в статусе ACTIVE — залейте их
            автором в «Студии» или прогоните <span className="mono">scripts/seed_videos.sh</span>.
          </p>
        ) : (
          <>
            <p className="mono">
              #{current.id} · автор #{current.creatorId} ·{" "}
              {current.creatorDisplayName ?? "без имени"}
            </p>
            {current.fileUrl && <video src={current.fileUrl} controls autoPlay muted />}
            <p>{current.title ?? <span className="dim">без заголовка</span>}</p>
            {current.aiContext && (
              <p className="dim">aiContext: {current.aiContext}</p>
            )}
            <div className="row">
              <button onClick={() => void swipe("SAVE")}>сохранить</button>
              <button className="ghost" onClick={() => void swipe("SKIP")}>
                пропустить
              </button>
              <button onClick={() => void write()}>написать автору об этом клипе</button>
            </div>
            {note && <p className="dim">{note}</p>}
            <RawJson value={current} />
          </>
        )}
      </section>

      <section className="card">
        <h2>Избранные авторы</h2>
        {favorites.length === 0 && <p className="dim">пока никого</p>}
        <ul>
          {favorites.map((f) => (
            <li key={f.creatorId} className="mono">
              #{f.creatorId} · {f.creatorEmail}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Проверить руками**

Войти зрителем, открыть `/feed`:

1. видео автора играет;
2. «сохранить» → надпись про избранное, автор появился в списке ниже;
3. повторный свайп по тому же клипу (вернуться назад по индексу не даст — проверить перезагрузкой страницы и свайпом того же первого клипа) → красная полоса `400 already swiped on this asset`, стенд продолжает работать;
4. «написать автору об этом клипе» → переход на `/chats/N?assetId=M`.

Expected: все четыре.

- [ ] **Step 4: Коммит**

```bash
git add -A
git commit -m "feat: feed with swipes, favorites and conversation start"
```

---

## Task 11: Список диалогов

**Files:**
- Create: `app/chats/page.tsx`

**Interfaces:**
- Consumes: `api`, `ConversationResponse`, `Page`, `useStream`.
- Produces: экран `/chats`.

- [ ] **Step 1: Написать экран**

`app/chats/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect } from "react";
import { useState } from "react";
import Link from "next/link";
import { api, isApiError, type ApiError } from "@/lib/api";
import { useStream } from "@/lib/stream";
import type { ConversationResponse, Page } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

export default function Chats() {
  const [items, setItems] = useState<ConversationResponse[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const { subscribe, status } = useStream();

  const load = useCallback(() => {
    api<Page<ConversationResponse>>("/api/chat/conversations?size=50")
      .then((p) => setItems(p.content))
      .catch((e) => isApiError(e) && setErr(e));
  }, []);

  useEffect(load, [load]);

  // any new message changes lastMessage and unreadCount, so the list refetches
  useEffect(() => subscribe((ev) => ev.event === "message" && load()), [subscribe, load]);

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>
        Диалоги <span className={`status ${status}`}>стрим {status}</span>
      </h1>
      <section className="card">
        {items.length === 0 && <p className="dim">пусто — начните из ленты</p>}
        {items.map((c) => (
          <p key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: ".6rem" }}>
            <Link href={`/chats/${c.id}`}>
              {c.partnerDisplayName ?? c.partnerName ?? `партнёр #${c.partnerId}`}
            </Link>{" "}
            {c.personaEnabled ? (
              <span className="mono" style={{ color: "var(--accent)" }}>
                AI
              </span>
            ) : (
              <span className="mono dim">без AI</span>
            )}
            {c.unreadCount > 0 && <span className="mono"> · непрочитано {c.unreadCount}</span>}
            <br />
            <span className="dim">{c.lastMessage ?? "нет сообщений"}</span>
          </p>
        ))}
        <RawJson value={items} label="GET /api/chat/conversations" />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Проверить руками**

Expected: в окне зрителя диалог виден с бейджем `AI` (персона включена в seed) и с приветствием персоны в `lastMessage`. В окне автора — тот же диалог, партнёр — зритель, бейдж `без AI` (персона принадлежит автору, а не партнёру).

- [ ] **Step 3: Коммит**

```bash
git add -A
git commit -m "feat: conversation list"
```

---

## Task 12: Переписка

Главный экран стенда: здесь видно и стрим токенов, и контекст клипа, и системные сообщения.

**Files:**
- Create: `app/chats/[id]/page.tsx`

**Interfaces:**
- Consumes: `api`, `send`, `useSession`, `useStream`, `emptyState`, `reduce`, `withHistory`, `seenAssets`, `MessageResponse`, `Page`.
- Produces: экран `/chats/[id]`.

- [ ] **Step 1: Написать экран**

`app/chats/[id]/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, isApiError, send, type ApiError } from "@/lib/api";
import { emptyState, reduce, withHistory, type ChatState } from "@/lib/reply-reducer";
import { seenAssets } from "@/lib/seen-assets";
import { useSession } from "@/lib/session";
import { useStream } from "@/lib/stream";
import type { ConversationResponse, MessageResponse, Page } from "@/lib/types";
import { ErrorBar } from "@/components/ErrorBar";
import { RawJson } from "@/components/RawJson";

// useSearchParams in a client page needs the route to stay dynamic, otherwise `next build`
// demands a Suspense boundary around it
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  ai_unavailable: "Ключ OpenAI не настроен — персона не ответит. Проверьте OPENAI_API_KEY.",
  rate_limited: "Потолок ответов на диалог — 12 в минуту. Подождите минуту.",
  internal: "Генерация упала. Смотрите лог бэкенда.",
};

export default function Chat() {
  const conversationId = Number(useParams().id);
  const contextFromFeed = useSearchParams().get("assetId");
  const { user } = useSession();
  const { subscribe, status } = useStream();

  const [state, setState] = useState<ChatState>(() => emptyState(conversationId));
  const [conversation, setConversation] = useState<ConversationResponse | null>(null);
  const [body, setBody] = useState("");
  const [assetId, setAssetId] = useState(contextFromFeed ?? "");
  const [err, setErr] = useState<ApiError | null>(null);

  const assets = useMemo(seenAssets, []);

  const loadHistory = useCallback(async () => {
    try {
      const page = await api<Page<MessageResponse>>(
        `/api/chat/conversations/${conversationId}/messages?size=50`,
      );
      // the endpoint returns newest first; the reducer wants them oldest first
      setState((s) => withHistory(s, [...page.content].reverse()));
      await send("POST", `/api/chat/conversations/${conversationId}/read`);
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadHistory();
    api<Page<ConversationResponse>>("/api/chat/conversations?size=50")
      .then((p) => setConversation(p.content.find((c) => c.id === conversationId) ?? null))
      .catch(() => undefined);
  }, [conversationId, loadHistory]);

  useEffect(() => subscribe((ev) => setState((s) => reduce(s, ev))), [subscribe]);

  async function sendMessage() {
    if (!body.trim()) return;
    const payload = { body, assetId: assetId ? Number(assetId) : null };
    setBody("");
    try {
      // the message comes back through the stream as well; the reducer dedupes by id
      await send<MessageResponse>(
        "POST",
        `/api/chat/conversations/${conversationId}/messages`,
        payload,
      );
    } catch (e) {
      if (isApiError(e)) setErr(e);
    }
  }

  const drafts = Object.entries(state.drafts);

  return (
    <main>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <h1>
        {conversation?.partnerDisplayName ?? `Диалог #${conversationId}`}{" "}
        {conversation?.personaEnabled ? (
          <span className="mono" style={{ color: "var(--accent)" }}>
            AI
          </span>
        ) : (
          <span className="mono dim">без AI</span>
        )}
        <span className={`status ${status}`}> · стрим {status}</span>
      </h1>

      {state.banner && (
        <div className="errorbar banner" role="status">
          {REASONS[state.banner] ?? state.banner}
        </div>
      )}

      <section className="card">
        <div className="bubbles">
          {state.messages.map((m) => (
            <div key={m.id} className={`bubble ${bubbleClass(m, user?.id)}`}>
              {m.body}
              <div className="meta">
                {m.senderType}
                {m.contextAssetId ? ` · из клипа #${m.contextAssetId}` : ""}
                {` · ${new Date(m.createdAt).toLocaleTimeString()}`}
              </div>
            </div>
          ))}
          {drafts.map(([replyId, text]) => (
            <div key={replyId} className="bubble draft">
              {text || "…"}
              <div className="meta">персона печатает · {replyId}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <label>сообщение</label>
        <textarea
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />
        <label>контекст: клип, о котором речь</label>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">без контекста</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} {a.title ?? a.type}
            </option>
          ))}
        </select>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button onClick={() => void sendMessage()}>отправить</button>
          <span className="dim">
            контекст хранится на каждом сообщении, поэтому его можно менять посреди разговора
          </span>
        </div>
      </section>

      <section className="card">
        <p className="dim">
          Автор, написавший сюда сам, AI не запускает — это правило бэкенда: пишет человек, значит
          человек и вмешался. Токены приходят только зрителю, поэтому в окне автора ответ персоны
          появляется целиком.
        </p>
        <RawJson value={state} label="состояние экрана" />
      </section>
    </main>
  );
}

function bubbleClass(m: MessageResponse, myId: number | undefined): string {
  if (m.senderType === "SYSTEM") return "system";
  if (m.senderType === "AI") return "ai";
  return m.senderId === myId ? "mine" : "";
}
```

- [ ] **Step 2: Проверить главный сценарий**

Два окна: обычное — зритель, инкогнито — автор. Бэкенд с `OPENAI_API_KEY`.

1. зритель из ленты пишет «где это снято?» с выбранным клипом;
2. в окне зрителя: пузырь своего сообщения, затем пунктирный черновик, набирающийся токенами, затем он сменяется готовым сообщением персоны;
3. в окне автора: оба сообщения появляются сами, без перезагрузки, ответ персоны — целиком;
4. под сообщением зрителя написано «из клипа #M»;
5. в ответе персоны видно знание `aiContext` — она упоминает Вену и репетицию;
6. автор пишет в тот же диалог — второго ответа AI **не** появляется;
7. `/debug` показывает всю последовательность: `message`, `reply-start`, `token`×N, `reply-end`, `message`.

Expected: все семь. Если вместо ответа приходит жёлтая полоса `ai_unavailable` — ключ не задан; `rate_limited` — сработал потолок 12/мин.

- [ ] **Step 3: Проверить отказ персоны**

Написать на тему из `boundaries` персоны (в seed — «политика»).

Expected: черновик снимается, приходит системное сообщение пунктирной плашкой по центру (текст из `ai.chat.refusal-message`), а не реплика персоны.

- [ ] **Step 4: Коммит**

```bash
git add -A
git commit -m "feat: conversation screen with streamed replies and clip context"
```

---

## Task 13: README и чеклист для клиента

Без этого стенд не работает: клиент не догадается про инкогнито и решит, что вход сломан.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Написать README**

`README.md`:

```markdown
# Toc2me — тестовый стенд

Локальный стенд для проверки чата: переписка зритель↔автор, ответы AI-персоны, видео-контекст.

## Главное про две личности

Кука сессии одна на хост, поэтому **две личности — это два окна браузера**:

- обычное окно — зритель (`user@demo.local`);
- окно инкогнито — автор (`creator@demo.local`).

Пароль у обоих: `demo1234`. В двух обычных окнах второй вход перезатрёт первый, и будет
казаться, что стенд сломан. Выхода нет намеренно: в бэкенде нет `/auth/logout`, а кука
`httpOnly` — полный выход делается очисткой кук в devtools.

## Запуск

### 1. Бэкенд

```bash
cd ../Toc2meBack
psql "$DATABASE_URL" -f scripts/migrations/001_asset_object_storage.sql   # на свежей базе
psql "$DATABASE_URL" -f scripts/migrations/002_widen_upload_id.sql        # на свежей базе
psql "$DATABASE_URL" -f scripts/seed-demo-users.sql                      # демо-аккаунты
export OPENAI_API_KEY=sk-...                                             # без него AI молчит
./mvnw spring-boot:run
```

Миграции обязательны: `ddl-auto` не переписывает CHECK-констрейнты, и статус `UPLOADING`
без них отвергается базой.

Без `OPENAI_API_KEY` бин провайдера не создаётся, и каждое сообщение отвечает жёлтой
плашкой `ai_unavailable`. Это правильное поведение, но проверять чат так нельзя.

### 2. Стенд

```bash
npm install
npm run dev
```

Порт обязан быть **3000** — он прошит в CORS бэкенда (`app.cors.allowed-origins`).

### 3. Наполнить ленту

Либо залить видео вручную в «Студии», либо скриптом бэкенда:

```bash
cd ../Toc2meBack
BASE_URL=http://localhost:8080 EMAIL=creator@demo.local PASSWORD=demo1234 \
  ./scripts/seed_videos.sh video
```

## Чеклист проверки

### Роли и вход
- [ ] «войти как зритель» → в шапке `USER`, есть числовой id
- [ ] «войти как автор» → `CREATOR`
- [ ] зритель нажимает «стать автором» → роль сменилась, `/studio` открылась
- [ ] профиль сохраняется, после «обновить» изменения на месте
- [ ] интересы показываются и сохраняются

### Ассеты
- [ ] загрузка mp4: прогресс по частям, в конце статус `ACTIVE`
- [ ] видео проигрывается в `<video>` — подписанный URL работает без заголовка авторизации
- [ ] `aiContext` сохраняется через «сохранить метаданные»
- [ ] аватар персоны грузится и её id попадает в форму
- [ ] удаление ассета убирает его из списка

### Лента
- [ ] чужие клипы показываются, свои — нет
- [ ] «сохранить» добавляет автора в избранное
- [ ] повторный свайп по тому же клипу даёт `400`, стенд продолжает работать

### Чат — главное
- [ ] диалог из ленты открывается сразу с приветствием персоны
- [ ] у зрителя ответ персоны набирается токенами в пунктирном пузыре
- [ ] у автора оба сообщения появляются без перезагрузки
- [ ] под сообщением написано «из клипа #N»
- [ ] персона в ответе опирается на `aiContext` клипа
- [ ] автор пишет сам → второго ответа AI нет
- [ ] сообщение на запретную тему → системная плашка вместо реплики персоны
- [ ] непрочитанные считаются, после открытия диалога сбрасываются

### Ошибки видны
- [ ] без `OPENAI_API_KEY` → плашка `ai_unavailable`, а не тишина
- [ ] 13 сообщений за минуту → плашка `rate_limited`
- [ ] `/studio` под ролью `USER` → `403 access denied` (бэкенд намеренно не объясняет причину, она в его логе)
- [ ] `/debug` показывает всю последовательность событий

## Что стенд не проверяет

Сброс пароля (нужен почтовый ящик), R2 и CDN (дев-режим держит файлы на диске),
работу в нескольких инстансах (реестр SSE-подключений живёт в памяти процесса).
```

- [ ] **Step 2: Пройти чеклист целиком**

Expected: все пункты отмечены. Любой незакрытый — либо баг стенда, либо находка в бэкенде; во втором случае записать её и не править бэкенд в рамках этого плана.

- [ ] **Step 3: Финальная проверка и коммит**

```bash
npm test
npm run build
git add -A
git commit -m "docs: harness README and manual test checklist"
```

Expected: 13 тестов зелёные, сборка без ошибок.

---

## Порядок выполнения

Задачи идут по номерам. Task 1 и 2 — в репозитории `Toc2meBack`, остальные — в `Toc2me-Harness`.

Зависимости: Task 5 требует Task 1 (`/me`) и Task 2 (аккаунты). Task 12 требует Task 6, 7 и 10 (`seen-assets`). Task 9 требует Task 8.

## Что остаётся незакрытым

Не недоделки плана, а зафиксированные решения — они должны попасть в описание PR:

- сброс пароля не покрыт: нужен почтовый ящик, а при seed-аккаунтах путь бессмысленен;
- в бэкенде нет `/auth/logout`, полный выход делается очисткой кук;
- нет эндпоинта, отдающего ассеты чужого автора, поэтому контекст клипа в чате берётся из
  того, что зритель видел в ленте (`sessionStorage`);
- стенд работает только против одного инстанса бэкенда;
- в `application-dev.yml:19` по-прежнему лежит рабочий Gmail app-password — его надо
  отозвать отдельным коммитом, стенд этого не касается.
