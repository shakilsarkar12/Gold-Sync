import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/db';

export async function GET() {
  try {
    const logs = await getLogs();
    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
