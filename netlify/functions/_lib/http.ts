import type { Context } from '@netlify/functions';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export type Handler = (req: Request, ctx: Context) => Promise<Response>;

/** Wraps a handler: method guard, JSON errors, never leaks internals. */
export function route(methods: string[], fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED');
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error('Unhandled function error', e);
      return json({ error: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' }, 500);
    }
  };
}

export async function readJson<T = any>(req: Request, maxBytes = 4_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'BAD_JSON');
  }
}

export const clientIp = (req: Request, ctx: Context) =>
  ctx.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
