import { NextResponse } from 'next/server';
import { getSettings, addLog } from '@/lib/db';
import { fetchLiveGoldRates } from '@/lib/goldapi';
import {
  fetchShopifyProducts,
  updateShopifyVariantPricesBulk,
  updateShopifyProductMetafields,
  updateShopifyVariantMetafieldsBulk,
  updateProductGoldRateMetafields,
  updateVariantBreakdownMetafields,
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

        const vSdWeight = parseFloat(variant.smallDiamondWeight);
        const pSdWeight = parseFloat(product.smallDiamondWeight);
        const sdWeight = (!isNaN(vSdWeight) && vSdWeight > 0)
          ? vSdWeight
          : (!isNaN(pSdWeight) && pSdWeight > 0 ? pSdWeight : 0);

        const vSdRate = parseFloat(variant.smallDiamondRatePerCarat);
        const pSdRate = parseFloat(product.smallDiamondRatePerCarat);
        const sdRate = (!isNaN(vSdRate) && vSdRate > 0)
          ? vSdRate
          : (!isNaN(pSdRate) && pSdRate > 0 ? pSdRate : (parseFloat(settings.smallDiamondPricePerCarat) || 0));

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
        const outOfSync = priceDiff > 0.05;

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
      const { productId, variantId, weight, karat, shape, crt, color, diamondPrice, smallDiamondWeight, smallDiamondRatePerCarat } = payload;
      
      if (variantId) {
        const parsedWeight = weight !== undefined && weight !== '' ? parseFloat(weight) : null;
        const parsedKarat = karat !== undefined && karat !== '' ? karat : null;
        const parsedShape = shape !== undefined && shape !== '' ? shape : null;
        const parsedCrt = crt !== undefined && crt !== '' ? parseFloat(crt) : null;
        const parsedColor = color !== undefined && color !== '' ? color : null;
        const parsedSdWeight = smallDiamondWeight !== undefined && smallDiamondWeight !== '' ? parseFloat(smallDiamondWeight) : null;
        const parsedSdRate = smallDiamondRatePerCarat !== undefined && smallDiamondRatePerCarat !== '' ? parseFloat(smallDiamondRatePerCarat) : null;

        await updateShopifyVariantMetafieldsBulk([{
          variantId,
          weight: parsedWeight,
          karat: parsedKarat,
          shape: parsedShape,
          crt: parsedCrt,
          color: parsedColor,
          smallDiamondWeight: parsedSdWeight,
          smallDiamondRatePerCarat: parsedSdRate,
        }]);

        return NextResponse.json({ success: true, message: 'Variant metafields updated successfully' });
      } else {
        if (!productId) {
          return NextResponse.json({ error: 'productId is required' }, { status: 400 });
        }

        const parsedWeight = weight !== undefined && weight !== '' ? parseFloat(weight) : null;
        const parsedKarat = karat !== undefined && karat !== '' ? karat : null;
        const parsedDiamondPrice = diamondPrice !== undefined && diamondPrice !== '' ? parseFloat(diamondPrice) : null;
        const parsedSdWeight = smallDiamondWeight !== undefined && smallDiamondWeight !== '' ? parseFloat(smallDiamondWeight) : null;
        const parsedSdRate = smallDiamondRatePerCarat !== undefined && smallDiamondRatePerCarat !== '' ? parseFloat(smallDiamondRatePerCarat) : null;

        await updateShopifyProductMetafields(productId, parsedWeight, parsedKarat, parsedDiamondPrice, parsedSdWeight, parsedSdRate);
        
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
        const parsedWeight = metafields.weight !== undefined && metafields.weight !== '' ? parseFloat(metafields.weight) : null;
        const parsedKarat = metafields.karat !== undefined && metafields.karat !== '' ? metafields.karat : null;
        const parsedShape = metafields.shape !== undefined && metafields.shape !== '' ? metafields.shape : null;
        const parsedCrt = metafields.crt !== undefined && metafields.crt !== '' ? parseFloat(metafields.crt) : null;
        const parsedColor = metafields.color !== undefined && metafields.color !== '' ? metafields.color : null;
        const parsedSdWeight = metafields.smallDiamondWeight !== undefined && metafields.smallDiamondWeight !== '' ? parseFloat(metafields.smallDiamondWeight) : null;
        const parsedSdRate = metafields.smallDiamondRatePerCarat !== undefined && metafields.smallDiamondRatePerCarat !== '' ? parseFloat(metafields.smallDiamondRatePerCarat) : null;

        const hasAnyMetafield = parsedWeight !== null || parsedKarat !== null ||
          parsedShape !== null || parsedCrt !== null || parsedColor !== null ||
          parsedSdWeight !== null || parsedSdRate !== null;

        if (hasAnyMetafield) {
          await updateShopifyVariantMetafieldsBulk([{
            variantId,
            weight: parsedWeight,
            karat: parsedKarat,
            shape: parsedShape,
            crt: parsedCrt,
            color: parsedColor,
            smallDiamondWeight: parsedSdWeight,
            smallDiamondRatePerCarat: parsedSdRate,
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
      
      // 3. Update global Gold Rate & Breakdown Metafields
      const settings = await getSettings();
      const rates = await fetchLiveGoldRates();
      await updateProductGoldRateMetafields([{ id: productId }], rates, settings).catch(console.error);

      if (settings.priceBreakdownEnabled && payload.breakdown) {
        await updateVariantBreakdownMetafields([{
          variantId,
          breakdown: {
            goldRatePerGram: payload.breakdown.goldPricePerGram,
            totalGoldValue: payload.breakdown.baseGoldCost,
            centreStoneValue: payload.breakdown.diamondPrice,
            smallDiamondValue: payload.breakdown.smallDiamondValue,
            makingChargeRate: parseFloat(settings.makingChargePerGram) || 0,
            totalMakingCharge: payload.breakdown.makingCharges,
          }
        }], settings).catch(console.error);
      }

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
            const parsedWeight = mf.weight !== undefined && mf.weight !== '' ? parseFloat(mf.weight) : null;
            const parsedKarat = mf.karat !== undefined && mf.karat !== '' ? mf.karat : null;
            const parsedShape = mf.shape !== undefined && mf.shape !== '' ? mf.shape : null;
            const parsedCrt = mf.crt !== undefined && mf.crt !== '' ? parseFloat(mf.crt) : null;
            const parsedColor = mf.color !== undefined && mf.color !== '' ? mf.color : null;
            const parsedSdWeight = mf.smallDiamondWeight !== undefined && mf.smallDiamondWeight !== '' ? parseFloat(mf.smallDiamondWeight) : null;
            const parsedSdRate = mf.smallDiamondRatePerCarat !== undefined && mf.smallDiamondRatePerCarat !== '' ? parseFloat(mf.smallDiamondRatePerCarat) : null;

            const hasAnyMetafield = parsedWeight !== null || parsedKarat !== null ||
              parsedShape !== null || parsedCrt !== null || parsedColor !== null ||
              parsedSdWeight !== null || parsedSdRate !== null;

            if (hasAnyMetafield) {
              await updateShopifyVariantMetafieldsBulk([{
                variantId: item.variantId,
                weight: parsedWeight,
                karat: parsedKarat,
                shape: parsedShape,
                crt: parsedCrt,
                color: parsedColor,
                smallDiamondWeight: parsedSdWeight,
                smallDiamondRatePerCarat: parsedSdRate,
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

      // 3. Update global Gold Rate & Breakdown Metafields for all unique products synced
      try {
        const uniqueProductIds = [...new Set(items.map(item => item.productId))];
        const dummyProducts = uniqueProductIds.map(id => ({ id }));
        const settings = await getSettings();
        const rates = await fetchLiveGoldRates();
        await updateProductGoldRateMetafields(dummyProducts, rates, settings);

        if (settings.priceBreakdownEnabled) {
          const breakdownItems = items.filter(item => item.breakdown).map(item => ({
            variantId: item.variantId,
            breakdown: {
              goldRatePerGram: item.breakdown.goldPricePerGram,
              totalGoldValue: item.breakdown.baseGoldCost,
              centreStoneValue: item.breakdown.diamondPrice,
              smallDiamondValue: item.breakdown.smallDiamondValue,
              makingChargeRate: parseFloat(settings.makingChargePerGram) || 0,
              totalMakingCharge: item.breakdown.makingCharges,
            }
          }));
          if (breakdownItems.length > 0) {
            await updateVariantBreakdownMetafields(breakdownItems, settings).catch(console.error);
          }
        }
      } catch (err) {
        console.error('[Bulk Sync] Failed to update product gold rate / breakdown metafields:', err);
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
