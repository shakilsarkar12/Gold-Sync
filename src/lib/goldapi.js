import { getSettings } from './db';
import { getGramRatesFromIbja } from './ibja';

let ratesCache = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLiveGoldRates(forceRefresh = false) {
  const settings = await getSettings();
  const currency = settings.currency || 'INR';

  const now = Date.now();
  if (
    !forceRefresh &&
    ratesCache &&
    ratesCache.currency === currency &&
    now - ratesCache.timestamp < CACHE_TTL
  ) {
    return ratesCache.data;
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
      timestamp: Math.floor(Date.now() / 1000),
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

    ratesCache = {
      data: rates,
      timestamp: now,
      currency: 'INR',
    };

    return rates;
  } catch (error) {
    console.error('Failed to fetch from IBJA:', error);
    
    if (ratesCache) {
      console.warn('Returning expired cache due to scraper error');
      return ratesCache.data;
    }

    throw error;
  }
}
