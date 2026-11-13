/**
 * Instrument specifications, pip sizes, contract multipliers,
 * and dynamic pip value calculations for Forex, JPY crosses, Metals, and Crypto.
 */

export interface InstrumentSpec {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: number;
  contractSize: number;
  digits: number;
  /** Dollar ($ USD) value of a 1-pip movement on 1.0 standard lot at current exchange rate */
  getPipValuePerLot: (currentPrice: number) => number;
}

export function cleanSymbol(symbol: string): string {
  return (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Detects instrument specification from symbol name and/or current price level.
 */
export function getInstrumentSpec(symbol: string, currentPrice: number = 1): InstrumentSpec {
  const s = cleanSymbol(symbol);
  const safePrice = Math.max(0.00001, currentPrice);

  // 1. Gold / Commodities
  if (s.includes('XAU') || s.includes('GOLD') || (safePrice >= 1200 && safePrice <= 5000)) {
    return {
      symbol: s || 'XAUUSD',
      baseCurrency: 'XAU',
      quoteCurrency: 'USD',
      pipSize: 0.1, // 10 cents = 1 standard gold pip ($10 per lot on 100 oz)
      contractSize: 100,
      digits: 2,
      getPipValuePerLot: () => 10.0,
    };
  }

  // 2. Crypto (BTC, ETH)
  if (s.includes('BTC') || safePrice > 5000) {
    return {
      symbol: s || 'BTCUSD',
      baseCurrency: 'BTC',
      quoteCurrency: 'USD',
      pipSize: 1.0,
      contractSize: 1,
      digits: 2,
      getPipValuePerLot: () => 1.0,
    };
  }

  // 3. JPY pairs (USDJPY, EURJPY, GBPJPY, etc.)
  if (s.includes('JPY') || (safePrice >= 50 && safePrice < 300)) {
    const base = s.length >= 6 ? s.slice(0, 3) : 'USD';
    return {
      symbol: s || 'USDJPY',
      baseCurrency: base,
      quoteCurrency: 'JPY',
      pipSize: 0.01,
      contractSize: 100000,
      digits: 3,
      // 1 pip on 100,000 units is 1,000 JPY. Converted to USD: 1000 / USDJPY rate
      getPipValuePerLot: (price: number) => {
        const rate = Math.max(1, price);
        return 1000 / rate;
      },
    };
  }

  // 4. Standard 4/5-decimal Forex pairs (EURUSD, GBPUSD, AUDUSD, NZDUSD, etc.)
  const base = s.length >= 6 ? s.slice(0, 3) : 'EUR';
  const quote = s.length >= 6 ? s.slice(3, 6) : 'USD';

  return {
    symbol: s || 'EURUSD',
    baseCurrency: base,
    quoteCurrency: quote,
    pipSize: 0.0001,
    contractSize: 100000,
    digits: 5,
    // On USD quote, 1 pip = 0.0001 * 100,000 = $10.00 USD per standard lot
    getPipValuePerLot: () => 10.0,
  };
}

/** Convert a price difference to pips */
export function priceDiffToPips(diff: number, symbol: string, currentPrice: number): number {
  const spec = getInstrumentSpec(symbol, currentPrice);
  return Math.abs(diff) / spec.pipSize;
}

/** Convert pips to price difference */
export function pipsToPriceDelta(pips: number, symbol: string, currentPrice: number): number {
  const spec = getInstrumentSpec(symbol, currentPrice);
  return pips * spec.pipSize;
}

/** Common pip step quick presets for Order Entry */
export const PIP_PRESETS = [10, 20, 30, 50, 100];
export const LOT_PRESETS = [0.1, 0.5, 1.0, 2.0];
