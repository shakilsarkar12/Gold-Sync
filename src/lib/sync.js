import { getSettings, addLog, setSyncStatus } from './db';
import { fetchLiveGoldRates } from './goldapi';
import { fetchShopifyProducts, updateShopifyVariantPrice } from './shopify';

// Helper to calculate pricing based on weight, karat, diamond price, rates, and settings
export function calculateVariantPrice(weight, karatStr, diamondPrice, rates, settings, variantTitle) {
  let karat = karatStr;
  
  // Fallback: Parse karat from variant title (e.g. "18K", "14 K", "22k")
  if (!karat && variantTitle) {
    const match = variantTitle.match(/(\d+)\s*k/i);
    if (match) {
      karat = match[0].toUpperCase().replace(/\s+/, '');
    }
  }

  if (!karat) {
    karat = settings.defaultKarat;
  }

  const karatNum = parseInt(karat.replace(/[^0-9]/g, '')) || 18;
  const karatKey = `price_gram_${karatNum}k`;
  
  let goldPricePerGram = rates[karatKey];
  if (!goldPricePerGram) {
    const priceGram24k = rates.price_gram_24k || (rates.price / 31.1035);
    goldPricePerGram = priceGram24k * (karatNum / 24);
  }

  const baseGoldCost = weight * goldPricePerGram;
  
  // Making charges: (weight * perGram) + fixed
  const makingCharges = (weight * settings.makingChargePerGram) + settings.makingChargeFixed;
  
  // Subtotal (including diamond price)
  const parsedDiamondPrice = parseFloat(diamondPrice) || 0;
  const subtotal = baseGoldCost + parsedDiamondPrice + makingCharges;
  
  // Markup multiplier
  const markupMultiplier = 1 + (settings.markupPercentage / 100);
  
  // Price before Tax: subtotal * multiplier + fixedMarkup
  const priceBeforeTax = (subtotal * markupMultiplier) + settings.fixedMarkup;

  // GST calculation
  const gstAmount = priceBeforeTax * (settings.gstPercentage / 100);

  // Final Price
  const finalPrice = priceBeforeTax + gstAmount;
  
  return {
    finalPrice: Number(finalPrice.toFixed(2)),
    breakdown: {
      goldPricePerGram: Number(goldPricePerGram.toFixed(4)),
      baseGoldCost: Number(baseGoldCost.toFixed(2)),
      diamondPrice: parsedDiamondPrice,
      makingCharges: Number(makingCharges.toFixed(2)),
      markupAmount: Number((subtotal * (markupMultiplier - 1)).toFixed(2)),
      fixedMarkup: settings.fixedMarkup,
      priceBeforeTax: Number(priceBeforeTax.toFixed(2)),
      gstAmount: Number(gstAmount.toFixed(2)),
      karatUsed: `${karatNum}K`,
    }
  };
}

export async function runProductSync(isAuto = false) {
  const settings = await getSettings();
  
  if (!settings.shopifyShop || !settings.shopifyAccessToken) {
    throw new Error('Shopify credentials are not configured.');
  }

  // Mark sync as running in DB so the frontend can poll and show the banner
  await setSyncStatus({ syncing: true, startedAt: new Date().toISOString(), lastResult: null });
  const rates = await fetchLiveGoldRates(true);
  
  // 2. Fetch all products from Shopify
  const products = await fetchShopifyProducts();
  
  // 3. Find out-of-sync items
  const outOfSyncItems = [];
  
  for (const product of products) {
    const isGold = product.weightValue !== null && product.weightValue > 0;
    if (!isGold) continue;
    
    for (const variant of product.variants) {
      const { finalPrice } = calculateVariantPrice(
        product.weightValue,
        product.karatValue,
        product.diamondPrice,
        rates,
        settings,
        variant.title
      );
      
      const diff = Math.abs(parseFloat(variant.price) - finalPrice);
      if (diff > 0.05) {
        outOfSyncItems.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          newPrice: finalPrice,
          oldPrice: variant.price,
        });
      }
    }
  }
  
  if (outOfSyncItems.length === 0) {
    return { success: true, successCount: 0, failCount: 0, errors: [] };
  }
  
  // 4. Update Shopify variant prices in bulk
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  
  for (const item of outOfSyncItems) {
    try {
      await updateShopifyVariantPrice(item.productId, item.variantId, item.newPrice.toString());
      successCount++;
    } catch (error) {
      failCount++;
      errors.push(`${item.productTitle} (${item.variantTitle}): ${error.message}`);
    }
  }
  
  // 5. Add log entry
  const prefix = isAuto ? 'Auto Sync' : 'Bulk Sync';
  if (successCount > 0 || failCount > 0) {
    await addLog({
      status: failCount > 0 ? 'failed' : 'success',
      type: 'bulk',
      details: `${prefix}: successfully updated ${successCount} variant prices.${
        failCount > 0 ? ` Failed ${failCount} variants.` : ''
      }`,
      productsUpdated: successCount,
    });
  }

  const syncResult = {
    success: failCount === 0,
    successCount,
    failCount,
    errors,
  };

  // Mark sync as complete in DB with result info
  await setSyncStatus({
    syncing: false,
    completedAt: new Date().toISOString(),
    lastResult: {
      success: syncResult.success,
      successCount,
      failCount,
      isAuto,
    },
  });

  return syncResult;
}
