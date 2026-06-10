import { getSettings, addLog, setSyncStatus } from './db';
import { fetchLiveGoldRates } from './goldapi';
import { fetchShopifyProducts, updateShopifyVariantPrice, updateShopifyVariantMetafields } from './shopify';

// Helper to calculate pricing based on weight, karat, diamond price, rates, and settings
export function calculateVariantPrice(weightOrParams, karatStr, diamondPrice, rates, settings, variantTitle) {
  let weight, karat, dPrice, liveRates, appSettings, title;
  let shape, crt, color;

  if (typeof weightOrParams === 'object' && weightOrParams !== null) {
    weight = weightOrParams.weight;
    karat = weightOrParams.karatStr;
    dPrice = weightOrParams.diamondPrice;
    liveRates = weightOrParams.rates;
    appSettings = weightOrParams.settings;
    title = weightOrParams.variantTitle;
    shape = weightOrParams.diamondShape;
    crt = weightOrParams.diamondCrt;
    color = weightOrParams.diamondColor;
  } else {
    weight = weightOrParams;
    karat = karatStr;
    dPrice = diamondPrice;
    liveRates = rates;
    appSettings = settings;
    title = variantTitle;
  }

  // Fallback: Parse karat from variant title (e.g. "18K", "14 K", "22k")
  if (!karat && title) {
    const match = title.match(/(\d+)\s*k/i);
    if (match) {
      karat = match[0].toUpperCase().replace(/\s+/, '');
    }
  }

  if (!karat) {
    karat = appSettings.defaultKarat;
  }

  const karatNum = parseInt(karat.replace(/[^0-9]/g, '')) || 18;
  const karatKey = `price_gram_${karatNum}k`;
  
  let goldPricePerGram = liveRates[karatKey];
  if (!goldPricePerGram) {
    const priceGram24k = liveRates.price_gram_24k || (liveRates.price / 31.1035);
    goldPricePerGram = priceGram24k * (karatNum / 24);
  }

  const baseGoldCost = (parseFloat(weight) || 0) * goldPricePerGram;
  
  // Making charges: (weight * perGram) + fixed
  const makingCharges = ((parseFloat(weight) || 0) * (parseFloat(appSettings.makingChargePerGram) || 0)) + (parseFloat(appSettings.makingChargeFixed) || 0);
  
  // Calculate diamond price dynamically if shape and crt are provided
  let calculatedDiamondPrice = 0;
  if (shape && crt && parseFloat(crt) > 0) {
    const cleanShape = shape.trim().toLowerCase();
    const cleanColor = (color || 'G-H').trim().toUpperCase();
    
    // Fallback default matrix if appSettings doesn't have it
    const defaultDiamondPrices = {
      round: { d: 34999, ef: 31999, gh: 29999 },
      princess: { d: 34999, ef: 31999, gh: 29999 },
      cushion: { d: 34999, ef: 31999, gh: 29999 },
      oval: { d: 34999, ef: 31999, gh: 29999 },
      emerald: { d: 34999, ef: 31999, gh: 29999 },
      portuguese: { d: 39999, ef: 36999, gh: 31999 },
      pear: { d: 34999, ef: 31999, gh: 29999 },
      asscher: { d: 34999, ef: 31999, gh: 29999 },
      heart: { d: 34999, ef: 31999, gh: 29999 },
      radiant: { d: 34999, ef: 31999, gh: 29999 },
      marquise: { d: 34999, ef: 31999, gh: 29999 },
      baguette: { d: 34999, ef: 31999, gh: 29999 }
    };
    
    const prices = appSettings.diamondPrices || defaultDiamondPrices;
    const shapePrices = prices[cleanShape];
    if (shapePrices) {
      let colorKey = 'gh';
      if (cleanColor === 'D') colorKey = 'd';
      else if (['E', 'F', 'E-F', 'EF'].includes(cleanColor)) colorKey = 'ef';
      else if (['G', 'H', 'G-H', 'GH'].includes(cleanColor)) colorKey = 'gh';
      
      const pricePerCrt = parseFloat(shapePrices[colorKey]) || 0;
      calculatedDiamondPrice = parseFloat(crt) * pricePerCrt;
    } else {
      calculatedDiamondPrice = parseFloat(dPrice) || 0;
    }
  } else {
    calculatedDiamondPrice = parseFloat(dPrice) || 0;
  }

  // Subtotal (including diamond price)
  const subtotal = baseGoldCost + calculatedDiamondPrice + makingCharges;
  
  // Markup multiplier
  const markupMultiplier = 1 + ((parseFloat(appSettings.markupPercentage) || 0) / 100);
  
  // Price before Tax: subtotal * multiplier + fixedMarkup
  const priceBeforeTax = (subtotal * markupMultiplier) + (parseFloat(appSettings.fixedMarkup) || 0);

  // GST calculation
  const gstAmount = priceBeforeTax * ((parseFloat(appSettings.gstPercentage) || 0) / 100);

  // Final Price
  const finalPrice = priceBeforeTax + gstAmount;
  
  return {
    finalPrice: Number(finalPrice.toFixed(2)),
    breakdown: {
      goldPricePerGram: Number(goldPricePerGram.toFixed(4)),
      baseGoldCost: Number(baseGoldCost.toFixed(2)),
      diamondPrice: calculatedDiamondPrice,
      makingCharges: Number(makingCharges.toFixed(2)),
      markupAmount: Number((subtotal * (markupMultiplier - 1)).toFixed(2)),
      fixedMarkup: parseFloat(appSettings.fixedMarkup) || 0,
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
    const hasGoldVariant = product.variants.some(v => v.weightValue !== null && v.weightValue > 0);
    const isProductGold = product.weightValue !== null && product.weightValue > 0;
    if (!isProductGold && !hasGoldVariant) continue;
    
    for (const variant of product.variants) {
      const vWeight = variant.weightValue !== null ? variant.weightValue : product.weightValue;
      const vKarat = variant.karatValue !== null ? variant.karatValue : product.karatValue;
      
      const isGold = vWeight !== null && vWeight > 0;
      if (!isGold) continue;

      const { finalPrice } = calculateVariantPrice({
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
      if (diff > 0.05) {
        outOfSyncItems.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          newPrice: finalPrice,
          oldPrice: variant.price,
          // Store current metafield values to push during sync
          metafields: {
            weight: variant.weightValue,
            karat: variant.karatValue,
            shape: variant.shapeValue,
            crt: variant.crtValue,
            color: variant.colorValue,
          },
        });
      }
    }
  }
  
  if (outOfSyncItems.length === 0) {
    // Mark sync as complete with 0 count
    await setSyncStatus({
      syncing: false,
      completedAt: new Date().toISOString(),
      lastResult: {
        success: true,
        successCount: 0,
        failCount: 0,
        isAuto,
      },
    });
    return { success: true, successCount: 0, failCount: 0, errors: [] };
  }
  
  // 4. Update Shopify variant prices in bulk
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  
  for (const item of outOfSyncItems) {
    try {
      // Save current metafield values to Shopify before updating price
      if (item.metafields) {
        const mf = item.metafields;
        const hasAnyMetafield = mf.weight !== null || mf.karat !== null ||
          mf.shape !== null || mf.crt !== null || mf.color !== null;
        if (hasAnyMetafield) {
          await updateShopifyVariantMetafields({
            productId: item.productId,
            variantId: item.variantId,
            weight: mf.weight !== null ? mf.weight : null,
            karat: mf.karat || null,
            shape: mf.shape || null,
            crt: mf.crt !== null ? mf.crt : null,
            color: mf.color || null,
          });
        }
      }
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
