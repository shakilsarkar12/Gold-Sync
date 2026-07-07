import { getSettings, getSavedGoldRates, saveGoldRates } from './db';
import { getGramRatesFromIbja } from './ibja';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLiveGoldRates(forceRefresh = false, checkCacheDuration = false) {
  const settings = await getSettings();
  const currency = settings.currency || 'INR';

  const savedCache = await getSavedGoldRates();
  const now = Date.now();

  // Just return the DB rates immediately if they exist and we are not forcing a refresh
  if (!forceRefresh && !checkCacheDuration && savedCache && savedCache.data) {
    return savedCache.data;
  }

  // Return DB rates if within 5 mins for checkCacheDuration mode
  if (!forceRefresh && checkCacheDuration && savedCache && savedCache.data) {
    if (now - savedCache.timestamp < CACHE_TTL) {
      return savedCache.data;
    }
  }

  try {
    const gramRates = await getGramRatesFromIbja();

    if (!gramRates) {
      throw new Error('Failed to scrape rates from IBJA');
    }

    const troyOunceToGrams = 31.1034768;
    const priceGram24k = gramRates["24K"];
    const spotPrice = priceGram24k * troyOunceToGrams;

    const rates = {
      timestamp: Math.floor(now / 1000),
      metal: 'XAU',
      currency: 'INR',
      price: Number(spotPrice.toFixed(4)),
      price_gram_24k: gramRates["24K"],
      price_gram_22k: Number((priceGram24k * 22 / 24).toFixed(4)),
      price_gram_21k: Number((priceGram24k * 21 / 24).toFixed(4)),
      price_gram_18k: gramRates["18K"],
      price_gram_14k: gramRates["14K"],
      price_gram_10k: Number((priceGram24k * 10 / 24).toFixed(4)),
    };

    const newCache = {
      data: rates,
      timestamp: now,
      currency: 'INR',
    };
    
    await saveGoldRates(newCache);

    return rates;
  } catch (error) {
    console.error('Failed to fetch from IBJA:', error);
    
    if (savedCache && savedCache.data) {
      console.warn('Returning expired cache from DB due to scraper error');
      return savedCache.data;
    }

    throw error;
  }
}
