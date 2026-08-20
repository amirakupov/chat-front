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
  // annotated because DEMO is `as const`: without it the state narrows to the literal
  // "user@demo.local" and typing in the field stops type-checking
  const [email, setEmail] = useState<string>(DEMO.user.email);
  const [password, setPassword] = useState<string>(DEMO.user.password);

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
