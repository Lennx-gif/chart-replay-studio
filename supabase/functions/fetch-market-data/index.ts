import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map timeframe to Yahoo Finance interval & range
function getYahooParams(timeframe: string, days?: number) {
  const rangeMap: Record<string, { interval: string; range: string }> = {
    "1m": { interval: "1m", range: "7d" },
    "5m": { interval: "5m", range: "60d" },
    "15m": { interval: "15m", range: "60d" },
    "1h": { interval: "1h", range: "730d" },
    "1d": { interval: "1d", range: "10y" },
    "1wk": { interval: "1wk", range: "10y" },
  };
  return rangeMap[timeframe] || rangeMap["1d"];
}

// Convert Yahoo symbol format (forex needs =X suffix, etc.)
function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  // Forex pairs like EURUSD -> EURUSD=X
  if (/^[A-Z]{6}$/.test(s) && !s.includes("=")) {
    return s + "=X";
  }
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe = "1d" } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: "Symbol is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yahooSymbol = normalizeSymbol(symbol);
    const { interval, range } = getYahooParams(timeframe);

    // Fetch from Yahoo Finance v8 chart API
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}&includePrePost=false`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Yahoo Finance error:", response.status, text);
      return new Response(
        JSON.stringify({ error: `Failed to fetch data for ${symbol}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result || !result.timestamp) {
      return new Response(
        JSON.stringify({ error: `No data found for ${symbol}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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

    // Cache to database using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Upsert bars into market_data (ignore conflicts)
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
      // Insert in batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error: insertError } = await supabase
          .from("market_data")
          .upsert(batch, { onConflict: "symbol,timeframe,timestamp" });

        if (insertError) {
          console.error("DB insert error:", insertError);
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
