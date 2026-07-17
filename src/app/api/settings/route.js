import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';

// Mask helper to hide sensitive credentials from being exposed in plain text to the browser
const maskSecret = (value, visibleLength = 4) => {
  if (!value) return '';
  if (value.length <= visibleLength) return '••••••••';
  return value.slice(0, visibleLength) + '••••••••';
};

export async function GET() {
  try {
    const settings = await getSettings();
    // Do not send shopify tokens to frontend at all
    const { shopifyAccessToken, shopifyDynamicToken, goldApiKey, ...safeSettings } = settings;
    
    return NextResponse.json(safeSettings);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    
    // Check if makingChargePerGram changed
    const currentSettings = await getSettings();
    const makingChargeChanged = currentSettings.makingChargePerGram !== payload.makingChargePerGram;

    // Remove sensitive keys from payload before saving if necessary
    const { shopifyAccessToken, shopifyDynamicToken, goldApiKey, ...settingsToSave } = payload;

    const updated = await saveSettings(settingsToSave);
    
    let responseMessage = 'Settings saved successfully';

    if (makingChargeChanged) {
      try {
        console.log('[Settings] Making charge per gram changed, updating product metafields...');
        
        // Dynamic import to avoid circular dependencies if any
        const { fetchShopifyProducts, updateProductMakingChargeMetafields } = await import('@/lib/shopify');
        const { addLog } = await import('@/lib/db');
        
        const products = await fetchShopifyProducts(null, true);
        await updateProductMakingChargeMetafields(products, updated.makingChargePerGram);
        
        const logMsg = `Making Charge updated to ${updated.makingChargePerGram}. Synced ${products.length} products' metafields.`;
        console.log(`[Settings] ${logMsg}`);
        
        await addLog({
          status: 'success',
          type: 'settings',
          details: logMsg,
          productsUpdated: products.length
        });

        responseMessage = `Settings saved. Metafields updated for ${products.length} products.`;
      } catch (err) {
        console.error('[Settings] Failed to update making charge metafields:', err);
        const { addLog } = await import('@/lib/db');
        await addLog({
          status: 'failed',
          type: 'settings',
          details: `Failed to sync making charge metafields: ${err.message}`
        });
        responseMessage = `Settings saved, but metafield update failed: ${err.message}`;
      }
    }

    // Do not send shopify tokens to frontend at all
    const { shopifyAccessToken: _t1, shopifyDynamicToken: _t2, goldApiKey: _t3, ...safeSettings } = updated;
    
    return NextResponse.json({ success: true, settings: safeSettings, message: responseMessage });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
