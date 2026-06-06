import { NextResponse } from 'next/server';
import { getSyncStatus } from '@/lib/db';

export async function GET() {
  try {
    const status = await getSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ syncing: false, lastResult: null, error: error.message }, { status: 500 });
  }
}
