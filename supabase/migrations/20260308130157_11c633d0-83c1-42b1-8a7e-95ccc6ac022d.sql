
-- Drop the overly permissive insert policy on market_data
DROP POLICY "Authenticated users can insert market data" ON public.market_data;

-- Only allow inserts via service role (edge functions) by not creating a user-facing insert policy
-- Edge functions use the service role key which bypasses RLS
