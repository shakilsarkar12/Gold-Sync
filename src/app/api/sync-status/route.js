import { NextResponse } from 'next/server';
import { getSyncStatus, setSyncStatus, addLog } from '@/lib/db';
import { getCurrentBulkOperation } from '@/lib/shopify';

export async function GET() {
  try {
    let status = await getSyncStatus();

    // Auto-clear stale sync status stuck for > 3 minutes without an active Shopify bulk operation
    if (status && status.syncing && status.startedAt && !status.bulkOperationId) {
      const elapsedMs = Date.now() - new Date(status.startedAt).getTime();
      if (elapsedMs > 3 * 60 * 1000) {
        console.warn('[Sync Status] Clearing stale sync status older than 3 minutes.');
        status = {
          syncing: false,
          completedAt: new Date().toISOString(),
          lastResult: { success: false, message: 'Previous sync timed out or reset.' }
        };
        await setSyncStatus(status);
        return NextResponse.json(status);
      }
    }

    // If we're waiting for a bulk operation, check its status
    if (status && status.syncing && status.bulkOperationId) {
      try {
        const bulkOp = await getCurrentBulkOperation();
        
        // Ensure it's the operation we are waiting for, or it's finished
        if (bulkOp && bulkOp.id === status.bulkOperationId) {
          if (bulkOp.status === 'COMPLETED' || bulkOp.status === 'FAILED' || bulkOp.status === 'CANCELED') {
            const success = bulkOp.status === 'COMPLETED';
            const successCount = success ? status.totalItems : 0;
            const failCount = success ? 0 : status.totalItems;
            
            await setSyncStatus({
              syncing: false,
              bulkOperationId: null,
              completedAt: new Date().toISOString(),
              lastResult: {
                success,
                successCount,
                failCount,
                isAuto: status.isAuto || false,
              },
            });
            
            await addLog({
              status: success ? 'success' : 'failed',
              type: 'bulk',
              details: `Bulk Operation ${success ? 'completed successfully' : 'failed'} for ${status.totalItems || 'many'} variants.`,
              productsUpdated: successCount,
            });
            
            // Return the new finished state
            const updatedStatus = await getSyncStatus();
            return NextResponse.json(updatedStatus);
          } else {
            // Still running — update completedItems from Shopify objectCount if available
            let completedItems = status.completedItems || 0;
            if (bulkOp.objectCount != null) {
              const parsedCount = parseInt(bulkOp.objectCount) || 0;
              if (parsedCount > completedItems) {
                completedItems = Math.min(parsedCount, status.totalItems || parsedCount);
                await setSyncStatus({
                  ...status,
                  completedItems,
                });
              }
            }
            return NextResponse.json({ ...status, completedItems, bulkStatus: bulkOp.status });
          }
        } else if (!bulkOp || bulkOp.id !== status.bulkOperationId) {
          // If bulk operation finished or missing, reset status
          status = {
            syncing: false,
            completedAt: new Date().toISOString(),
            lastResult: { success: true, message: 'Bulk operation finished or reset.' }
          };
          await setSyncStatus(status);
          return NextResponse.json(status);
        }
      } catch (err) {
        console.error("Error checking bulk operation status:", err);
      }
    }

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ syncing: false, lastResult: null, error: error.message }, { status: 500 });
  }
}
