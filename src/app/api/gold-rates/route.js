import { NextResponse } from 'next/server';
import { getGramRatesFromIbja } from '@/lib/ibja';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const gramRates = await getGramRatesFromIbja();

    if (!gramRates) {
        return NextResponse.json(
            {
                success: false,
                message: 'Could not load live gold rates.'
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        source: "IBJA Rates Scraper",
        unit: "1 Gram",
        currency: "INR",
        timestamp: Math.floor(Date.now() / 1000),
        rates: gramRates
    });
}
