import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getGramRatesFromIbja() {
    try {
        const url = 'https://ibjarates.com/';
        
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        const getFirstValidRate = (label) => {
            let rate = NaN;
            $(`td[data-label="${label}"]`).each((_, el) => {
                const text = $(el).text().trim();
                const parsed = parseFloat(text.replace(/,/g, ''));
                if (!isNaN(parsed) && parsed > 0) {
                    rate = parsed;
                    return false; // Break loop
                }
            });
            return rate;
        };

        const price999_10g = getFirstValidRate("Gold 999");
        const price750_10g = getFirstValidRate("Gold 750");
        const price585_10g = getFirstValidRate("Gold 585");

        if (isNaN(price999_10g) || isNaN(price750_10g) || isNaN(price585_10g)) {
            throw new Error('Could not scrape rates from IBJA site.');
        }

        const ratesPerGram = {
            "24K": parseFloat((price999_10g / 10).toFixed(2)),
            "18K": parseFloat((price750_10g / 10).toFixed(2)),
            "14K": parseFloat((price585_10g / 10).toFixed(2))
        };

        return ratesPerGram;

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return null;
    }
}
