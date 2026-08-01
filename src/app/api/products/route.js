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
        const rawWeight = variant.weightValue !== null ? variant.weightValue : product.weightValue;
        const vWeight = (rawWeight !== null && !isNaN(parseFloat(rawWeight)) && parseFloat(rawWeight) > 0)
          ? parseFloat(rawWeight)
          : (parseFloat(settings.defaultWeight) || 3.5);
        const vKarat = variant.karatValue !== null ? variant.karatValue : product.karatValue;

        isAnyVariantGold = true;

        const sdWeight = variant.smallDiamondWeight !== null && variant.smallDiamondWeight !== undefined
          ? variant.smallDiamondWeight
          : product.smallDiamondWeight;
        const sdRate = variant.smallDiamondRatePerCarat !== null && variant.smallDiamondRatePerCarat !== undefined
          ? variant.smallDiamondRatePerCarat
          : product.smallDiamondRatePerCarat;

        // Run calculation: weight and diamond details are resolved with variant priority
        const { finalPrice, compareAtPrice, breakdown } = calculateVariantPrice({
          weight: vWeight,
          karatStr: vKarat,
          diamondPrice: product.diamondPrice,
          diamondShape: variant.shapeValue,
          diamondCrt: variant.crtValue,
          diamondColor: variant.colorValue,
          smallDiamondWeight: sdWeight,
          smallDiamondRatePerCarat: sdRate,
          rates,
          settings,
          variantTitle: variant.title
        });

        const priceDiff = Math.abs(parseFloat(variant.price) - finalPrice);
        const currentCompareAt = parseFloat(variant.compareAtPrice) || 0;
        const compareDiff = Math.abs(currentCompareAt - compareAtPrice);
        const outOfSync = priceDiff > 0.05 || compareDiff > 0.05;

        if (outOfSync) {
          productOutOfSync = true;
        }

        return {
          ...variant,
          isGoldVariant: true,
          calculatedPrice: finalPrice,
          calculatedCompareAtPrice: compareAtPrice,
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

      // 2. Update the variant price and compareAtPrice in Shopify
      const calculatedCompareAt = payload.compareAtPrice !== undefined && payload.compareAtPrice !== null
        ? payload.compareAtPrice
        : (parseFloat(newPrice) * 2).toFixed(2);

      await updateShopifyVariantPricesBulk(productId, [{
        id: variantId,
        price: newPrice.toString(),
        compareAtPrice: calculatedCompareAt.toString()
      }]);
      
      // 3. Update the global Gold Rate Metafields (14K, 18K etc.)
      const settings = await getSettings();
      const rates = await fetchLiveGoldRates();
      await updateProductGoldRateMetafields([{ id: productId }], rates, settings).catch(console.error);

      await addLog({
        status: 'success',
        type: 'single',
        details: `Updated '${productTitle}' (${variantTitle || 'Default'}) price to $${newPrice} (Compare at $${calculatedCompareAt})`,
        productsUpdated: 1,
      });

      return NextResponse.json({ success: true, message: 'Variant price and metafields synced successfully' });
    }

    if (action === 'sync_bulk') {
      const { items } = payload;
      if (!items || !Array.isArray(items)) {
        return NextResponse.json({ error: 'items array is required' }, { status: 400 });
      }

      if (items.length === 0) {
        return NextResponse.json({ success: true, count: 0, message: 'No items to sync' });
      }

      // If updating 50 or more items, use Shopify Bulk Operations API (JSONL Upload)
      // to handle 22,000+ variants without HTTP timeouts or rate limit issues
      if (items.length >= 50) {
        const groupedByProduct = {};
        for (const item of items) {
          if (!groupedByProduct[item.productId]) {
            groupedByProduct[item.productId] = [];
          }
          groupedByProduct[item.productId].push(item);
        }

        let jsonlString = '';
        const productIds = Object.keys(groupedByProduct);
        for (const pid of productIds) {
          const pItems = groupedByProduct[pid];
          const variants = pItems.map((item) => {
            const cap = item.compareAtPrice !== undefined && item.compareAtPrice !== null
              ? item.compareAtPrice
              : (parseFloat(item.newPrice) * 2).toFixed(2);
            return {
              id: item.variantId,
              price: item.newPrice.toString(),
              compareAtPrice: cap.toString(),
            };
          });
          jsonlString += JSON.stringify({ productId: pid, variants }) + '\n';
        }

        const { runBulkProductVariantsUpdate } = await import('@/lib/shopify');
        const bulkOperationId = await runBulkProductVariantsUpdate(jsonlString);

        await setSyncStatus({
          syncing: true,
          startedAt: new Date().toISOString(),
          isAuto: false,
          totalItems: items.length,
          completedItems: 0,
          bulkOperationId,
        });

        return NextResponse.json({
          success: true,
          queued: true,
          bulkOperationId,
          totalItems: items.length,
          message: `Queued bulk sync for ${items.length} variants on Shopify. Progress will update automatically.`,
        });
      }

      // For small updates (< 50 items), update synchronously
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

          // 2. Update the price and compareAtPrice
          const itemCap = item.compareAtPrice !== undefined && item.compareAtPrice !== null
            ? item.compareAtPrice
            : (parseFloat(item.newPrice) * 2).toFixed(2);

          await updateShopifyVariantPricesBulk(item.productId, [{
            id: item.variantId,
            price: item.newPrice.toString(),
            compareAtPrice: itemCap.toString()
          }]);
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
