/**
 * Tiny same-origin admin client. The Medusa admin UI is served from the
 * same host/port as the API, so a fetch with credentials: 'include' carries
 * the session cookie. No SDK lock-in.
 */

type Json = Record<string, unknown>;

export type AdminFetchError = Error & {
  status: number;
  body: unknown;
};

async function adminFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers ?? {}),
    },
    ...opts,
  });

  const text = await res.text();
  const body: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = new Error(
      `Admin API ${res.status} on ${path}: ${
        (body as { message?: string })?.message ?? text.slice(0, 200)
      }`,
    ) as AdminFetchError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const api = {
  get: <T>(path: string) => adminFetch<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: Json) =>
    adminFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: Json) =>
    adminFetch<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => adminFetch<T>(path, { method: "DELETE" }),
};

export function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}
