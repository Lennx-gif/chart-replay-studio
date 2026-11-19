import type { NewsEventRecord } from './db';

/**
 * Pre-bundled realistic economic calendar events matching the sample datasets
 * (e.g. EURUSD Jan-March 2024 and onwards).
 */
export const SAMPLE_NEWS_EVENTS: NewsEventRecord[] = [
  // January 2024
  {
    id: 'news-sample-1',
    time: 1704979800, // Jan 11, 2024 13:30 UTC
    currency: 'USD',
    title: 'Core CPI m/m',
    impact: 'high',
    actual: '0.3%',
    forecast: '0.3%',
    previous: '0.3%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-2',
    time: 1704979800, // Jan 11, 2024 13:30 UTC
    currency: 'USD',
    title: 'CPI y/y',
    impact: 'high',
    actual: '3.4%',
    forecast: '3.2%',
    previous: '3.1%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-3',
    time: 1705584600, // Jan 18, 2024 13:30 UTC
    currency: 'USD',
    title: 'Unemployment Claims',
    impact: 'medium',
    actual: '187K',
    forecast: '206K',
    previous: '203K',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-4',
    time: 1706187600, // Jan 25, 2024 13:15 UTC
    currency: 'EUR',
    title: 'Main Refinancing Rate (ECB Decision)',
    impact: 'high',
    actual: '4.50%',
    forecast: '4.50%',
    previous: '4.50%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-5',
    time: 1706190300, // Jan 25, 2024 13:45 UTC
    currency: 'EUR',
    title: 'ECB Monetary Policy Statement & Press Conference',
    impact: 'high',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-6',
    time: 1706189400, // Jan 25, 2024 13:30 UTC
    currency: 'USD',
    title: 'Advance GDP q/q',
    impact: 'high',
    actual: '3.3%',
    forecast: '2.0%',
    previous: '4.9%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-7',
    time: 1706727600, // Jan 31, 2024 19:00 UTC
    currency: 'USD',
    title: 'FOMC Statement & Federal Funds Rate',
    impact: 'high',
    actual: '5.50%',
    forecast: '5.50%',
    previous: '5.50%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-8',
    time: 1706729400, // Jan 31, 2024 19:30 UTC
    currency: 'USD',
    title: 'FOMC Press Conference',
    impact: 'high',
    source: 'ForexFactory',
  },
  // February 2024
  {
    id: 'news-sample-9',
    time: 1706880600, // Feb 2, 2024 13:30 UTC
    currency: 'USD',
    title: 'Non-Farm Employment Change (NFP)',
    impact: 'high',
    actual: '353K',
    forecast: '187K',
    previous: '333K',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-10',
    time: 1706880600, // Feb 2, 2024 13:30 UTC
    currency: 'USD',
    title: 'Unemployment Rate',
    impact: 'high',
    actual: '3.7%',
    forecast: '3.8%',
    previous: '3.7%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-11',
    time: 1707831000, // Feb 13, 2024 13:30 UTC
    currency: 'USD',
    title: 'CPI m/m',
    impact: 'high',
    actual: '0.3%',
    forecast: '0.2%',
    previous: '0.2%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-12',
    time: 1708003800, // Feb 15, 2024 13:30 UTC
    currency: 'USD',
    title: 'Core Retail Sales m/m',
    impact: 'high',
    actual: '-0.6%',
    forecast: '0.2%',
    previous: '0.4%',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-13',
    time: 1708542000, // Feb 21, 2024 19:00 UTC
    currency: 'USD',
    title: 'FOMC Meeting Minutes',
    impact: 'medium',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-14',
    time: 1708588800, // Feb 22, 2024 09:00 UTC
    currency: 'EUR',
    title: 'Flash Manufacturing PMI',
    impact: 'medium',
    actual: '46.1',
    forecast: '47.0',
    previous: '46.6',
    source: 'ForexFactory',
  },
  {
    id: 'news-sample-15',
    time: 1709127000, // Feb 28, 2024 13:30 UTC
    currency: 'USD',
    title: 'Prelim GDP q/q',
    impact: 'high',
    actual: '3.2%',
    forecast: '3.3%',
    previous: '3.3%',
    source: 'ForexFactory',
  },
];
