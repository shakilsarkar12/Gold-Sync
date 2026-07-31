import { NextResponse } from 'next/server';
import { getSettings, addLog } from '@/lib/db';
import { fetchShopifyProducts, updateDiamondPriceMetafields } from '@/lib/shopify';

export const maxDuration = 300;

export async function POST() {
  try {
    const settings = await getSettings();
    if (!settings.shopifyShop) {
      return NextResponse.json({ error: 'Shopify store not configured.' }, { status: 400 });
    }

    console.log('[Gemstone MF Sync] Fetching products from Shopify...');
    const products = await fetchShopifyProducts(null, true);
    
    console.log(`[Gemstone MF Sync] Pushing D, E-F, G-H price per carat metafields for ${products.length} products...`);
    await updateDiamondPriceMetafields(products, settings);

    const logDetails = `Successfully synced Gemstone Price Matrix (D, E-F, G-H) per carat metafields for ${products.length} products to Shopify.`;
    await addLog({
      status: 'success',
      type: 'gemstone_metafields',
      details: logDetails,
      productsUpdated: products.length,
    });

    return NextResponse.json({
      success: true,
      message: logDetails,
      count: products.length,
    });
  } catch (error) {
    console.error('[Gemstone MF Sync Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync gemstone price metafields' }, { status: 500 });
  }
}
