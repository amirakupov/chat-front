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
