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
      <h1>Toc2me test harness</h1>
      <p className="dim">
        Two identities — two windows: a normal one for the viewer, incognito for the creator. The
        cookie is per host, so in two normal windows a sign-in overwrites itself.
      </p>

      <section className="card">
        <h2>Sign in</h2>
        <div className="row">
          <button onClick={() => login(DEMO.user.email, DEMO.user.password)}>
            sign in as viewer
          </button>
          <button onClick={() => login(DEMO.creator.email, DEMO.creator.password)}>
            sign in as creator
          </button>
        </div>
        <div className="grid2" style={{ marginTop: ".8rem" }}>
          <div>
            <label>email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label>password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button className="ghost" onClick={() => login(email, password)}>
            sign in
          </button>
          <span className="dim">
            there is no sign-out: the backend has no /auth/logout and the cookie is httpOnly.
            Switching identity means signing in as another account; a full sign-out means clearing
            cookies in devtools.
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Who am I</h2>
        {loading ? (
          <p className="dim">loading…</p>
        ) : user ? (
          <>
            <p className="mono">
              #{user.id} · {user.email} · {user.role}
            </p>
            <div className="row">
              <button className="ghost" onClick={() => void refresh()}>
                refresh
              </button>
              {user.role === "USER" && <button onClick={() => void becomeCreator()}>become a creator</button>}
            </div>
            <RawJson value={user} />
          </>
        ) : (
          <p className="dim">signed out</p>
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
      <h2>Profile</h2>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <div className="grid2">
        <div>
          <label>name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>age</label>
          <input value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>
      <label>city</label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button onClick={() => void save()}>save</button>
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
      <h2>Interests</h2>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      {all.length === 0 && <p className="dim">empty — run seed-demo-users.sql</p>}
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
          save
        </button>
        {saved && <span className="dim">saved</span>}
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
      <summary>Registration with confirmation (usually not needed — the accounts are seeded)</summary>
      <ErrorBar error={err} onClear={() => setErr(null)} />
      <div className="grid2" style={{ marginTop: ".6rem" }}>
        <div>
          <label>email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label>password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button
          className="ghost"
          onClick={() =>
            void run(
              () => send("POST", "/auth/register", { email, password, role: "USER" }),
              "email sent",
            )
          }
        >
          register
        </button>
        <button
          className="ghost"
          onClick={() =>
            void run(() => send("POST", "/auth/resend-confirmation", { email }), "email resent")
          }
        >
          resend email
        </button>
      </div>
      <label>token from the email</label>
      <input value={token} onChange={(e) => setToken(e.target.value)} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button
          className="ghost"
          onClick={() =>
            void run(
              () => api(`/auth/confirm?token=${encodeURIComponent(token)}`),
              "email confirmed",
            )
          }
        >
          confirm
        </button>
        {note && <span className="dim">{note}</span>}
      </div>
      <p className="dim">
        The link in the email points at <span className="mono">localhost:3000/app/…</span> — the
        harness has no such route, so the token has to be copied out of the address bar by hand.
      </p>
    </details>
  );
}
