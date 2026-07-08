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

        const price999 = parseFloat($('#GoldRatesCompare999').text().replace(/,/g, ''));
        const price916 = parseFloat($('#GoldRatesCompare916').text().replace(/,/g, ''));
        const price750 = parseFloat($('#GoldRatesCompare750').text().replace(/,/g, ''));
        const price585 = parseFloat($('#GoldRatesCompare585').text().replace(/,/g, ''));

        if (isNaN(price999) || isNaN(price916) || isNaN(price750) || isNaN(price585)) {
            throw new Error('Could not scrape rates from IBJA site widgets.');
        }

        const ratesPerGram = {
            "24K": price999,
            "22K": price916,
            "18K": price750,
            "14K": price585
        };

        return ratesPerGram;

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return null;
    }
}
