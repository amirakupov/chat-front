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
