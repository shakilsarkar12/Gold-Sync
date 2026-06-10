import { getSettings } from './db';

let ratesCache = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function calculateKaratRates(spotPrice, currency) {
  const troyOunceToGrams = 31.1034768;
  const priceGram24k = spotPrice / troyOunceToGrams;

  return {
    timestamp: Math.floor(Date.now() / 1000),
    metal: 'XAU',
    currency,
    price: spotPrice,
    price_gram_24k: Number(priceGram24k.toFixed(4)),
    price_gram_22k: Number((priceGram24k * 22 / 24).toFixed(4)),
    price_gram_21k: Number((priceGram24k * 21 / 24).toFixed(4)),
    price_gram_18k: Number((priceGram24k * 18 / 24).toFixed(4)),
    price_gram_14k: Number((priceGram24k * 14 / 24).toFixed(4)),
    price_gram_10k: Number((priceGram24k * 10 / 24).toFixed(4)),
  };
}

export async function fetchLiveGoldRates(forceRefresh = false) {
  const settings = await getSettings();
  const apiKey = settings.goldApiKey;
  const currency = settings.currency || 'USD';

  if (!apiKey) {
    throw new Error('GoldAPI.io key is not configured in settings.');
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    ratesCache &&
    ratesCache.currency === currency
  ) {
    return ratesCache.data;
  }

  try {
    const url = `https://www.goldapi.io/api/XAU/${currency}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-access-token': apiKey,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GoldAPI returned status ${response.status}: ${errorText || response.statusText}`);
    }

    const data = await response.json();

    if (!data.price) {
      throw new Error('GoldAPI response is missing the main "price" field.');
    }

    const rates = {
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      metal: data.metal || 'XAU',
      currency: data.currency || currency,
      price: data.price,
      price_gram_24k: data.price_gram_24k || Number((data.price / 31.1035).toFixed(4)),
      price_gram_22k: data.price_gram_22k || Number(((data.price / 31.1035) * (22 / 24)).toFixed(4)),
      price_gram_21k: data.price_gram_21k || Number(((data.price / 31.1035) * (21 / 24)).toFixed(4)),
      price_gram_18k: data.price_gram_18k || Number(((data.price / 31.1035) * (18 / 24)).toFixed(4)),
      price_gram_14k: data.price_gram_14k || Number(((data.price / 31.1035) * (14 / 24)).toFixed(4)),
      price_gram_10k: data.price_gram_10k || Number(((data.price / 31.1035) * (10 / 24)).toFixed(4)),
    };

    ratesCache = {
      data: rates,
      timestamp: now,
      currency,
    };

    return rates;
  } catch (error) {
    console.error('Failed to fetch from GoldAPI:', error);
    
    if (ratesCache && ratesCache.currency === currency) {
      console.warn('Returning expired cache due to API error');
      return ratesCache.data;
    }

    if (apiKey.toLowerCase() === 'test' || apiKey.toLowerCase() === 'sandbox') {
      console.warn('Using dummy gold rate (sandbox mode)');
      return calculateKaratRates(2350.50, currency);
    }

    throw error;
  }
}
