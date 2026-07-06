import { NextResponse } from 'next/server';
import { fetchLiveGoldRates } from '@/lib/goldapi';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('refresh') === 'true';
    
    const rates = await fetchLiveGoldRates(force);
    return NextResponse.json(rates);
  } catch (error) {
    console.error('Gold rate endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch gold rates' },
      { status: 500 }
    );
  }
}
