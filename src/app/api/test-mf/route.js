import { getSettings } from '@/lib/db';
import { fetchShopifyProducts, updateProductGoldRateMetafields } from '@/lib/shopify';
import { fetchLiveGoldRates } from '@/lib/goldapi';

export async function GET(req) {
  try {
    const settings = await getSettings();
    const products = await fetchShopifyProducts(null, true);
    const rates = await fetchLiveGoldRates();
    
    await updateProductGoldRateMetafields(products.slice(0, 1), rates, settings);
    return Response.json({ success: true, settings });
  } catch (err) {
    return Response.json({ success: false, error: err.message, stack: err.stack });
  }
}
