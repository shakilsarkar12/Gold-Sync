import { NextResponse } from 'next/server';
import { getSettings, addLog } from '@/lib/db';
import { fetchLiveGoldRates } from '@/lib/goldapi';
import {
  fetchShopifyProducts,
  updateShopifyVariantPrice,
  updateShopifyProductMetafields,
} from '@/lib/shopify';
import { calculateVariantPrice, runProductSync } from '@/lib/sync';
import { initScheduler } from '@/lib/scheduler';

export async function GET() {
  try {
    initScheduler(); // Initialize background auto-sync scheduler if not already running
    const settings = await getSettings();
    
    if (!settings.shopifyShop || !settings.shopifyAccessToken) {
      return NextResponse.json({
        products: [],
        warning: 'Shopify is not configured. Please visit the Settings page.',
      });
    }

    let rates;
    try {
      rates = await fetchLiveGoldRates();
    } catch (e) {
      return NextResponse.json(
        { error: `GoldAPI Error: ${e.message}. Please verify your API Key in Settings.` },
        { status: 500 }
      );
    }

    const products = await fetchShopifyProducts();
    
    // Enrich variants of each product using product-level weight/diamond fields
    const enrichedProducts = products.map((product) => {
      const isGold = product.weightValue !== null && product.weightValue > 0;
      let productOutOfSync = false;

      const enrichedVariants = product.variants.map((variant) => {
        if (!isGold) {
          return {
            ...variant,
            isGoldVariant: false,
            calculatedPrice: null,
            outOfSync: false,
          };
        }

        // Run calculation: weight and diamondPrice come from product level, karat is variant-dependent
        const { finalPrice, breakdown } = calculateVariantPrice(
          product.weightValue,
          product.karatValue, // product-level karat fallback
          product.diamondPrice, // product-level diamond price
          rates,
          settings,
          variant.title // variant-level title (for karat parsing)
        );

        const diff = Math.abs(parseFloat(variant.price) - finalPrice);
        const outOfSync = diff > 0.05;

        if (outOfSync) {
          productOutOfSync = true;
        }

        return {
          ...variant,
          isGoldVariant: true,
          calculatedPrice: finalPrice,
          priceBreakdown: breakdown,
          outOfSync,
        };
      });

      return {
        ...product,
        variants: enrichedVariants,
        isGoldProduct: isGold,
        outOfSync: productOutOfSync,
      };
    });

    return NextResponse.json({
      products: enrichedProducts,
      goldRates: rates,
    });
  } catch (error) {
    console.error('Products fetch/enrichment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch and enrich products' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { action, ...payload } = await request.json();
    
    if (action === 'update_metafields') {
      const { productId, weight, karat, diamondPrice } = payload;
      
      if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
      }

      const parsedWeight = weight !== undefined && weight !== '' ? parseFloat(weight) : null;
      const parsedKarat = karat !== undefined && karat !== '' ? karat : null;
      const parsedDiamondPrice = diamondPrice !== undefined && diamondPrice !== '' ? parseFloat(diamondPrice) : null;

      await updateShopifyProductMetafields(productId, parsedWeight, parsedKarat, parsedDiamondPrice);
      
      return NextResponse.json({ success: true, message: 'Product metafields updated successfully' });
    }
    
    if (action === 'sync_variant') {
      const { productId, productTitle, variantId, variantTitle, newPrice, oldPrice } = payload;
      
      if (!productId || !variantId || !newPrice) {
        return NextResponse.json({ error: 'productId, variantId and newPrice are required' }, { status: 400 });
      }

      await updateShopifyVariantPrice(productId, variantId, newPrice.toString());
      
      await addLog({
        status: 'success',
        type: 'single',
        details: `Updated '${productTitle}' (${variantTitle || 'Default'}) price from $${oldPrice} to $${newPrice}`,
        productsUpdated: 1,
      });

      return NextResponse.json({ success: true, message: 'Variant price synced successfully' });
    }

    if (action === 'sync_bulk') {
      const result = await runProductSync(false); // Manual bulk sync trigger
      return NextResponse.json({
        success: result.success,
        successCount: result.successCount,
        failCount: result.failCount,
        errors: result.errors,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API products action error:', error);
    return NextResponse.json(
      { error: error.message || 'Operation failed' },
      { status: 500 }
    );
  }
}
