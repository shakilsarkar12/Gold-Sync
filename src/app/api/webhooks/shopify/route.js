import { NextResponse } from 'next/server';
import { getSyncStatus, setSyncStatus, addLog } from '@/lib/db';

/**
 * Webhook handler for Shopify BULK_OPERATIONS_FINISH event.
 * Shopify sends a POST request here automatically when a bulk operation completes on their server.
 */
export async function POST(req) {
  try {
    const rawBody = await req.text();
    let body = {};
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error('[Shopify Webhook] Invalid JSON payload:', e);
    }

    const topic = req.headers.get('x-shopify-topic') || '';
    console.log(`[Shopify Webhook] Received event: ${topic}`, body);

    if (topic === 'bulk_operations/finish' || body.type === 'mutation' || body.admin_graphql_api_id) {
      const bulkOpId = body.admin_graphql_api_id;
      const statusStr = (body.status || '').toUpperCase();
      const isSuccess = statusStr === 'COMPLETED';

      const currentStatus = await getSyncStatus();

      // Verify if this webhook belongs to our active bulk operation (or update status regardless)
      if (currentStatus && currentStatus.syncing) {
        const totalItems = currentStatus.totalItems || 0;
        const successCount = isSuccess ? totalItems : 0;
        const failCount = isSuccess ? 0 : totalItems;

        await setSyncStatus({
          syncing: false,
          bulkOperationId: null,
          completedAt: new Date().toISOString(),
          lastResult: {
            success: isSuccess,
            successCount,
            failCount,
            isAuto: currentStatus.isAuto || false,
            message: `Bulk Operation ${statusStr} via Webhook.`,
          },
        });

        await addLog({
          status: isSuccess ? 'success' : 'failed',
          type: 'bulk_webhook',
          details: `Shopify Webhook: Bulk Operation finished with status [${statusStr}] for ${totalItems} variants.`,
          productsUpdated: successCount,
        });

        console.log(`[Shopify Webhook] Successfully updated sync status to COMPLETED for bulk operation ${bulkOpId}`);
      }
    }

    // Always return 200 OK to Shopify to acknowledge receipt of the webhook
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[Shopify Webhook] Error processing webhook:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
