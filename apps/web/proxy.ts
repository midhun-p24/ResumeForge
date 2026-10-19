import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { contentSecurityPolicy } from './lib/security';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64');
  const policy = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|downloads/).*)'] };
