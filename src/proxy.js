import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Define public paths that don't require authentication
const publicPaths = ['/login', '/api/auth/login', '/api/cron-sync', '/api/gold-rates'];

export default async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public paths and static files
  if (
    publicPaths.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret_do_not_use');
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (error) {
    // Token is invalid or expired
    const response = redirectToLogin(request);
    // Clear the invalid cookie
    response.cookies.delete('auth_token');
    return response;
  }
}

function redirectToLogin(request) {
  // If it's an API route, return 401 instead of redirecting
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Otherwise redirect to login page
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
