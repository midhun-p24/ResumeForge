import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key && !url.includes('YOUR_PROJECT')
    ? createClient(url, key, {
        auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null;
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json as T;
}
export function download(value: string, filename: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
