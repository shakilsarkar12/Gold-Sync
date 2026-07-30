import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { username, password, rememberMe } = await request.json();

    const validUsername = process.env.ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD;

    if (!validUsername || !validPassword) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (username === validUsername && password === validPassword) {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret_do_not_use');
      
      // If rememberMe is checked, token lasts 30 days; otherwise 7 days
      const isRemember = rememberMe !== false; // Default to true if true/undefined
      const expiresIn = isRemember ? '30d' : '7d';
      const maxAgeSeconds = isRemember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;

      // Create the JWT token using jose
      const token = await new SignJWT({ username, role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(secret);

      const response = NextResponse.json({ success: true, message: 'Logged in successfully' });

      // Set the HTTP-only cookie with sameSite: lax and 30 days maxAge
      response.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: maxAgeSeconds,
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
