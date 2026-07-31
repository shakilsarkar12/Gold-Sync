import { NextResponse } from 'next/server';
import { getSettings, addLog } from '@/lib/db';
import { fetchLiveGoldRates } from '@/lib/goldapi';
import {
  fetchShopifyProducts,
  updateProductGoldRateMetafields,
  updateVariantBreakdownMetafields,
  updateDiamondPriceMetafields,
} from '@/lib/shopify';
import { calculateVariantPrice } from '@/lib/sync';

export const maxDuration = 300; // Allow up to 5 minutes execution

export async function POST() {
  try {
    const settings = await getSettings();
    if (!settings.shopifyShop) {
      return NextResponse.json({ error: 'Shopify store not configured.' }, { status: 400 });
    }

    const rates = await fetchLiveGoldRates(true);
    const products = await fetchShopifyProducts(null, true);

    const allGoldBreakdowns = [];
    for (const product of products) {
      if (!product.variants) continue;
      for (const variant of product.variants) {
        const rawWeight = variant.weightValue !== null ? variant.weightValue : product.weightValue;
        const vWeight = (rawWeight !== null && !isNaN(parseFloat(rawWeight)) && parseFloat(rawWeight) > 0)
          ? parseFloat(rawWeight)
          : (parseFloat(settings.defaultWeight) || 3.5);
        const vKarat = variant.karatValue !== null ? variant.karatValue : product.karatValue;

        const { breakdown } = calculateVariantPrice({
          weight: vWeight,
          karatStr: vKarat,
          diamondPrice: product.diamondPrice,
          diamondShape: variant.shapeValue,
          diamondCrt: variant.crtValue,
          diamondColor: variant.colorValue,
          rates,
          settings,
          variantTitle: variant.title,
        });

        const sdWeight = variant.smallDiamondWeight;
        const sdPricePerCarat = parseFloat(settings.smallDiamondPricePerCarat) || 0;
        const smallDiamondValue = (sdWeight != null && sdWeight > 0 && sdPricePerCarat > 0)
          ? Number((sdWeight * sdPricePerCarat).toFixed(2))
          : 0;

        allGoldBreakdowns.push({
          variantId: variant.id,
          breakdown: {
            goldRatePerGram: breakdown.goldPricePerGram,
            totalGoldValue: breakdown.baseGoldCost,
            centreStoneValue: breakdown.diamondPrice,
            smallDiamondValue,
            makingChargeRate: parseFloat(settings.makingChargePerGram) || 0,
            totalMakingCharge: breakdown.makingCharges,
          },
        });
      }
    }

    // Run all metafield updates
    console.log('[Sync Metafields] Updating Gold Rate Metafields...');
    await updateProductGoldRateMetafields(products, rates, settings).catch(e => console.warn(e.message));

    console.log('[Sync Metafields] Updating Breakdown Metafields...');
    await updateVariantBreakdownMetafields(allGoldBreakdowns, settings).catch(e => console.warn(e.message));

    console.log('[Sync Metafields] Updating D, E-F, G-H Diamond Price Metafields...');
    await updateDiamondPriceMetafields(products, settings).catch(e => console.warn(e.message));

    await addLog({
      status: 'success',
      type: 'metafields',
      details: `Successfully updated Gold Rate, Breakdown, D, E-F, G-H price metafields for ${products.length} products.`,
      productsUpdated: products.length,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully updated all metafields (Gold Rate, Breakdown, D/EF/GH Prices) for ${products.length} products.`,
      productCount: products.length,
    });
  } catch (error) {
    console.error('[Sync Metafields Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync metafields' }, { status: 500 });
  }
}
