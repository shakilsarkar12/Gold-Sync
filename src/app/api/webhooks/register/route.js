import { NextResponse } from 'next/server';
import { registerBulkOperationWebhook } from '@/lib/shopify';

export async function POST(req) {
  try {
    const { appUrl } = await req.json().catch(() => ({}));
    const host = appUrl || process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || req.headers.get('host');
    
    if (!host) {
      return NextResponse.json({ error: 'App URL / Domain is required to register webhook.' }, { status: 400 });
    }

    let cleanHost = host.startsWith('http') ? host : `https://${host}`;
    cleanHost = cleanHost.replace(/\/+$/, '');
    const callbackUrl = `${cleanHost}/api/webhooks/shopify`;

    const sub = await registerBulkOperationWebhook(callbackUrl);
    return NextResponse.json({
      success: true,
      message: `Successfully registered BULK_OPERATIONS_FINISH webhook with Shopify!`,
      webhook: sub,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
