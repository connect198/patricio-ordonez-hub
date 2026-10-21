/** Only serve images from trusted hosts to the public guest experience. */
const BASE = ['jotform.com', 'jotformpro.com', 'jotformeu.com', 'supabase.co', 'supabase.in'];
export function safeImageUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return null;
    const extra = (process.env.ALLOWED_IMAGE_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ok = [...BASE, ...extra].some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}
