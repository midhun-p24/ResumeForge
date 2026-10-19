export function contentSecurityPolicy(
  nonce: string,
  development: boolean,
  supabaseOrigin?: string,
) {
  const cloud = supabaseOrigin ? new URL(supabaseOrigin).origin : '';
  const realtime = cloud.replace(/^https:/, 'wss:');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self' ${cloud} ${realtime}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `frame-src 'self' blob: ${cloud}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
