import { NextResponse } from 'next/server';
import { getSyncStatus, setSyncStatus, addLog } from '@/lib/db';
import { getCurrentBulkOperation } from '@/lib/shopify';

export async function GET() {
  try {
    const status = await getSyncStatus();

    // If we're waiting for a bulk operation, check its status
    if (status.syncing && status.bulkOperationId) {
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
            // Still running, just return current status with bulk details
            return NextResponse.json({ ...status, bulkStatus: bulkOp.status });
          }
        } else if (!bulkOp || bulkOp.id !== status.bulkOperationId) {
           // The bulk operation might be missing if it's too old or a new one started
           // We shouldn't hang forever. Let's assume it failed or finished if we can't find it.
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
