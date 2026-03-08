import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map timeframe to Yahoo Finance interval & range
function getYahooParams(timeframe: string) {
  const rangeMap: Record<string, { interval: string; range: string }> = {
    "1m": { interval: "1m", range: "7d" },
    "2m": { interval: "2m", range: "60d" },
    "5m": { interval: "5m", range: "60d" },
    "15m": { interval: "15m", range: "60d" },
    "30m": { interval: "30m", range: "60d" },
    "1h": { interval: "1h", range: "730d" },
    "4h": { interval: "1h", range: "730d" },
    "1d": { interval: "1d", range: "10y" },
    "1wk": { interval: "1wk", range: "10y" },
    "1mo": { interval: "1mo", range: "10y" },
  };
  return rangeMap[timeframe] || rangeMap["1d"];
}

// Convert symbol format for Yahoo Finance
function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  // Forex pairs like EURUSD -> EURUSD=X
  if (/^[A-Z]{6}$/.test(s) && !s.includes("=")) {
    return s + "=X";
  }
  return s;
}

// Fetch bars for a single symbol
async function fetchSymbolBars(symbol: string, timeframe: string): Promise<any[]> {
  const yahooSymbol = normalizeSymbol(symbol);
  const { interval, range } = getYahooParams(timeframe);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Yahoo Finance error for ${symbol}:`, response.status, text);
    throw new Error(`Failed to fetch data for ${symbol}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];

  if (!result || !result.timestamp) {
    throw new Error(`No data found for ${symbol}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const bars = [];

  for (let i = 0; i < timestamps.length; i++) {
    if (
      quote.open[i] != null &&
      quote.high[i] != null &&
      quote.low[i] != null &&
      quote.close[i] != null
    ) {
      bars.push({
        timestamp: new Date(timestamps[i] * 1000).toISOString(),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume?.[i] ?? 0,
      });
    }
  }

  return bars;
}

// Compute custom spread from multiple symbols
function computeSpread(
  allBars: Map<string, any[]>,
  formula: string,
  symbols: string[]
): any[] {
  // Simple formulas: "A - B", "A / B", "A + B", "A * B"
  // Map timestamps across all symbols
  const timestampMap = new Map<string, Record<string, number>>();

  for (const [sym, bars] of allBars) {
    for (const b of bars) {
      if (!timestampMap.has(b.timestamp)) {
        timestampMap.set(b.timestamp, {});
      }
      timestampMap.get(b.timestamp)![sym] = b.close;
    }
  }

  const result: any[] = [];
  for (const [ts, prices] of timestampMap) {
    if (symbols.every((s) => prices[s] != null)) {
      let value: number;
      const A = prices[symbols[0]];
      const B = prices[symbols[1]];

      if (formula.includes("/")) value = A / B;
      else if (formula.includes("*")) value = A * B;
      else if (formula.includes("+")) value = A + B;
      else value = A - B; // default subtraction

      result.push({
        timestamp: ts,
        open: value,
        high: value,
        low: value,
        close: value,
        volume: 0,
      });
    }
  }

  return result.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      symbol,
      symbols,
      timeframe = "1d",
      formula,
      useCache = true,
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Multi-symbol / spread mode
    if (symbols && Array.isArray(symbols) && symbols.length > 1) {
      const allBars = new Map<string, any[]>();

      // Fetch all symbols in parallel
      const results = await Promise.allSettled(
        symbols.map((s: string) => fetchSymbolBars(s, timeframe))
      );

      for (let i = 0; i < symbols.length; i++) {
        const res = results[i];
        if (res.status === "fulfilled") {
          allBars.set(symbols[i].toUpperCase(), res.value);
        } else {
          console.error(`Failed to fetch ${symbols[i]}:`, res.reason);
        }
      }

      if (formula) {
        const spreadBars = computeSpread(
          allBars,
          formula,
          symbols.map((s: string) => s.toUpperCase())
        );
        return new Response(
          JSON.stringify({
            symbol: formula,
            timeframe,
            bars: spreadBars,
            count: spreadBars.length,
            type: "spread",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return all symbols' data
      const multiData: Record<string, any> = {};
      for (const [sym, bars] of allBars) {
        multiData[sym] = { bars, count: bars.length };
      }

      return new Response(
        JSON.stringify({ symbols: multiData, timeframe }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single symbol mode
    if (!symbol) {
      return new Response(JSON.stringify({ error: "Symbol is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache first
    if (useCache) {
      const cacheThreshold = new Date(
        Date.now() - 15 * 60 * 1000
      ).toISOString(); // 15 min cache
      const { data: cached } = await supabase
        .from("market_data")
        .select("*")
        .eq("symbol", symbol.toUpperCase())
        .eq("timeframe", timeframe)
        .gte("created_at", cacheThreshold)
        .order("timestamp", { ascending: true })
        .limit(1);

      if (cached && cached.length > 0) {
        // Return cached data
        const { data: allCached } = await supabase
          .from("market_data")
          .select("*")
          .eq("symbol", symbol.toUpperCase())
          .eq("timeframe", timeframe)
          .order("timestamp", { ascending: true });

        if (allCached && allCached.length > 50) {
          return new Response(
            JSON.stringify({
              symbol: symbol.toUpperCase(),
              timeframe,
              bars: allCached.map((r: any) => ({
                timestamp: r.timestamp,
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                volume: Number(r.volume || 0),
              })),
              count: allCached.length,
              cached: true,
              source: "database",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // Fetch fresh data
    const bars = await fetchSymbolBars(symbol, timeframe);

    if (bars.length === 0) {
      return new Response(
        JSON.stringify({ error: `No data found for ${symbol}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cache to database
    const rows = bars.map((b) => ({
      symbol: symbol.toUpperCase(),
      timeframe,
      timestamp: b.timestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error: insertError } = await supabase
          .from("market_data")
          .upsert(batch, { onConflict: "symbol,timeframe,timestamp" });

        if (insertError) {
          console.error("DB cache error:", insertError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        symbol: symbol.toUpperCase(),
        timeframe,
        bars,
        count: bars.length,
        cached: true,
        source: "yahoo",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-market-data error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
