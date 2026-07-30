import { NextResponse } from 'next/server';
import { getSettings, getMakingChargeStatus, setMakingChargeStatus, addLog } from '@/lib/db';
import { fetchShopifyProducts, updateProductMakingChargeMetafields } from '@/lib/shopify';

export const maxDuration = 300;

export async function GET() {
  try {
    const status = await getMakingChargeStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ syncing: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const settings = await getSettings();
    const makingCharge = settings.makingChargePerGram || 0;

    // Set initial status to syncing
    await setMakingChargeStatus({
      syncing: true,
      completed: false,
      completedItems: 0,
      totalItems: 0,
      makingCharge,
      message: '[MakingCharge MF] Fetching products from Shopify...'
    });

    // Run background update
    (async () => {
      try {
        const products = await fetchShopifyProducts(null, true);
        const total = products.length;

        await setMakingChargeStatus({
          syncing: true,
          completed: false,
          completedItems: 0,
          totalItems: total,
          makingCharge,
          message: `[MakingCharge MF] Updating making charge metafields for ${total} products...`
        });

        await updateProductMakingChargeMetafields(products, makingCharge, async (completed, totalCount) => {
          await setMakingChargeStatus({
            syncing: true,
            completed: false,
            completedItems: completed,
            totalItems: totalCount,
            makingCharge,
            message: `[MakingCharge MF] Syncing metafields (${completed}/${totalCount} products)...`
          });
        });

        const logMsg = `[Settings] Making Charge updated to ${makingCharge}. Synced ${total} products' metafields.`;
        console.log(`[Settings] ${logMsg}`);

        await addLog({
          status: 'success',
          type: 'settings',
          details: logMsg,
          productsUpdated: total,
        });

        await setMakingChargeStatus({
          syncing: false,
          completed: true,
          completedItems: total,
          totalItems: total,
          makingCharge,
          logMessage: `[MakingCharge MF] Updated making charge metafields for ${total} products.`,
          settingsMessage: `[Settings] Making Charge updated to ${makingCharge}. Synced ${total} products' metafields.`,
          message: `[MakingCharge MF] Updated making charge metafields for ${total} products.`
        });
      } catch (err) {
        console.error('Making charge sync failed:', err);
        await setMakingChargeStatus({
          syncing: false,
          completed: false,
          error: err.message,
          message: `[MakingCharge MF] Sync Error: ${err.message}`
        });
      }
    })();

    return NextResponse.json({ success: true, message: 'Making charge sync started.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
