import { NextResponse } from 'next/server';
import { getSettings, addLog } from '@/lib/db';
import { fetchLiveGoldRates } from '@/lib/goldapi';
import {
  fetchShopifyProducts,
  updateShopifyVariantPricesBulk,
  updateShopifyProductMetafields,
  updateShopifyVariantMetafieldsBulk,
  updateProductGoldRateMetafields,
} from '@/lib/shopify';
import { calculateVariantPrice, runProductSync } from '@/lib/sync';
import { initScheduler } from '@/lib/scheduler';
import { setSyncStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    initScheduler(); // Initialize background auto-sync scheduler if not already running
    const settings = await getSettings();
    
    if (!settings.shopifyShop) {
      return NextResponse.json({
        products: [],
        warning: 'Shopify Store URL is not configured. Please visit the Settings page.',
      });
    }

    const url = new URL(request.url);
    const bypassCache = url.searchParams.get('refresh') === 'true';

    let rates;
    try {
      rates = await fetchLiveGoldRates(bypassCache);
    } catch (e) {
      return NextResponse.json(
        { error: `GoldAPI Error: ${e.message}. Please verify your API Key in Settings.` },
        { status: 500 }
      );
    }

    const products = await fetchShopifyProducts(null, bypassCache);
    
    // Enrich variants of each product using variant-level fields, or product-level fallbacks
    const enrichedProducts = products.map((product) => {
      let productOutOfSync = false;
      let isAnyVariantGold = false;

      const enrichedVariants = product.variants.map((variant) => {
        const vWeight = variant.weightValue !== null ? variant.weightValue : product.weightValue;
        const vKarat = variant.karatValue !== null ? variant.karatValue : product.karatValue;

        const isGold = vWeight !== null && vWeight > 0;
        if (!isGold) {
          return {
            ...variant,
            isGoldVariant: false,
            calculatedPrice: null,
            outOfSync: false,
          };
        }

        isAnyVariantGold = true;

        // Run calculation: weight and diamond details are resolved with variant priority
        const { finalPrice, breakdown } = calculateVariantPrice({
          weight: vWeight,
          karatStr: vKarat,
          diamondPrice: product.diamondPrice,
          diamondShape: variant.shapeValue,
          diamondCrt: variant.crtValue,
          diamondColor: variant.colorValue,
          rates,
          settings,
          variantTitle: variant.title
        });

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
        isGoldProduct: isAnyVariantGold || (product.weightValue !== null && product.weightValue > 0),
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
      const { productId, variantId, weight, karat, shape, crt, color, diamondPrice } = payload;
      
      if (variantId) {
        const parsedWeight = weight !== undefined && weight !== '' ? parseFloat(weight) : null;
        const parsedKarat = karat !== undefined && karat !== '' ? karat : null;
        const parsedShape = shape !== undefined && shape !== '' ? shape : null;
        const parsedCrt = crt !== undefined && crt !== '' ? parseFloat(crt) : null;
        const parsedColor = color !== undefined && color !== '' ? color : null;

        await updateShopifyVariantMetafieldsBulk([{
          variantId,
          weight: parsedWeight,
          karat: parsedKarat,
          shape: parsedShape,
          crt: parsedCrt,
          color: parsedColor,
        }]);

        return NextResponse.json({ success: true, message: 'Variant metafields updated successfully' });
      } else {
        if (!productId) {
          return NextResponse.json({ error: 'productId is required' }, { status: 400 });
        }

        const parsedWeight = weight !== undefined && weight !== '' ? parseFloat(weight) : null;
        const parsedKarat = karat !== undefined && karat !== '' ? karat : null;
        const parsedDiamondPrice = diamondPrice !== undefined && diamondPrice !== '' ? parseFloat(diamondPrice) : null;

        await updateShopifyProductMetafields(productId, parsedWeight, parsedKarat, parsedDiamondPrice);
        
        return NextResponse.json({ success: true, message: 'Product metafields updated successfully' });
      }
    }
    
    if (action === 'sync_variant') {
      const { productId, productTitle, variantId, variantTitle, newPrice, oldPrice, metafields } = payload;
      
      if (!productId || !variantId || !newPrice) {
        return NextResponse.json({ error: 'productId, variantId and newPrice are required' }, { status: 400 });
      }

      // 1. Save any edited metafields to Shopify first
      if (metafields) {
        const parsedWeight = metafields.weight !== '' ? parseFloat(metafields.weight) : null;
        const parsedKarat = metafields.karat !== '' ? metafields.karat : null;
        const parsedShape = metafields.shape !== '' ? metafields.shape : null;
        const parsedCrt = metafields.crt !== '' ? parseFloat(metafields.crt) : null;
        const parsedColor = metafields.color !== '' ? metafields.color : null;

        // Only call if at least one metafield has a value
        const hasAnyMetafield = parsedWeight !== null || parsedKarat !== null ||
          parsedShape !== null || parsedCrt !== null || parsedColor !== null;

        if (hasAnyMetafield) {
          await updateShopifyVariantMetafieldsBulk([{
            variantId,
            weight: parsedWeight,
            karat: parsedKarat,
            shape: parsedShape,
            crt: parsedCrt,
            color: parsedColor,
          }]);
        }
      }

      // 2. Update the variant price in Shopify
      await updateShopifyVariantPricesBulk(productId, [{ id: variantId, price: newPrice.toString() }]);
      
      // 3. Update the global Gold Rate Metafields (14K, 18K etc.)
      const settings = await getSettings();
      const rates = await fetchLiveGoldRates();
      await updateProductGoldRateMetafields([{ id: productId }], rates, settings).catch(console.error);

      await addLog({
        status: 'success',
        type: 'single',
        details: `Updated '${productTitle}' (${variantTitle || 'Default'}) price from $${oldPrice} to $${newPrice}`,
        productsUpdated: 1,
      });

      return NextResponse.json({ success: true, message: 'Variant price and metafields synced successfully' });
    }

    if (action === 'sync_bulk') {
      const { items } = payload;
      if (!items || !Array.isArray(items)) {
        return NextResponse.json({ error: 'items array is required' }, { status: 400 });
      }

      let successCount = 0;
      let failCount = 0;
      const errors = [];

      await setSyncStatus({
        syncing: true,
        startedAt: new Date().toISOString(),
        isAuto: false,
        totalItems: items.length,
        completedItems: 0,
        lastResult: null
      });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          // 1. Save metafields if provided
          if (item.metafields) {
            const mf = item.metafields;
            const parsedWeight = mf.weight !== '' ? parseFloat(mf.weight) : null;
            const parsedKarat = mf.karat !== '' ? mf.karat : null;
            const parsedShape = mf.shape !== '' ? mf.shape : null;
            const parsedCrt = mf.crt !== '' ? parseFloat(mf.crt) : null;
            const parsedColor = mf.color !== '' ? mf.color : null;

            const hasAnyMetafield = parsedWeight !== null || parsedKarat !== null ||
              parsedShape !== null || parsedCrt !== null || parsedColor !== null;

            if (hasAnyMetafield) {
              await updateShopifyVariantMetafieldsBulk([{
                variantId: item.variantId,
                weight: parsedWeight,
                karat: parsedKarat,
                shape: parsedShape,
                crt: parsedCrt,
                color: parsedColor,
              }]);
            }
          }

          // 2. Update the price
          await updateShopifyVariantPricesBulk(item.productId, [{ id: item.variantId, price: item.newPrice.toString() }]);
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`${item.productTitle} (${item.variantTitle}): ${err.message}`);
        }
        if ((i + 1) % 5 === 0 || i === items.length - 1) {
          await setSyncStatus({
            syncing: true,
            isAuto: false,
            totalItems: items.length,
            completedItems: i + 1,
          });
        }
      }

      // 3. Update the global Gold Rate Metafields (14K, 18K etc.) for all unique products synced
      try {
        const uniqueProductIds = [...new Set(items.map(item => item.productId))];
        const dummyProducts = uniqueProductIds.map(id => ({ id }));
        const settings = await getSettings();
        const rates = await fetchLiveGoldRates();
        await updateProductGoldRateMetafields(dummyProducts, rates, settings);
      } catch (err) {
        console.error('[Bulk Sync] Failed to update product gold rate metafields:', err);
      }

      if (successCount > 0) {
        await addLog({
          status: failCount > 0 ? 'failed' : 'success',
          type: 'bulk',
          details: `Manual Sync: updated ${successCount} variant prices + metafields.${failCount > 0 ? ` Failed: ${failCount}.` : ''}`,
          productsUpdated: successCount,
        });
      }

      await setSyncStatus({
        syncing: false,
        completedAt: new Date().toISOString(),
        lastResult: {
          success: failCount === 0,
          successCount,
          failCount,
          isAuto: false,
        },
      });

      return NextResponse.json({
        success: failCount === 0,
        successCount,
        failCount,
        errors,
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
