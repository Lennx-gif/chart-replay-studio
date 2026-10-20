# Chart Replay Studio

Practise trading on historical price data, bar by bar. Everything runs in the browser and is stored in a
local database (IndexedDB) on your machine — **no account, no login, no server**.

## Features

**Replay**
- Play / pause with speeds from 0.25 to 100 units per second
- Step by **bar** (finest data resolution) or by whole **candle** of the chart timeframe; Shift = ×10
- Step backwards — trades placed after the rewind point are undone, trades that closed "in the future" are reopened
- Higher timeframes are built only from bars revealed so far, so the newest candle is partial and nothing leaks from the future
- Switch timeframe mid-replay without losing your place; multi-timeframe side panel
- Jump to a date/time, next session open (Sydney / Tokyo / London / New York), ±1 day / +1 week, or any % of the data
- Bookmarks with labels and next/previous navigation
- Optional "pause on trade" — playback stops on the exact bar where an order fills or hits SL/TP
- Orders are evaluated against every base bar, so a big jump can never skip a stop-loss or take-profit

**Trading & analysis**
- Market and limit orders, SL/TP, close all, cancel pending; entry/SL/TP lines and entry/exit markers on the chart
- Drawing tools, trade journal and statistics, market-session shading

**Sessions & local storage**
- Every replay is a *session*: position, trades, drawings, bookmarks, notes, timeframe and settings autosave continuously
- Home screen lists sessions with progress and P&L; resume, duplicate or delete
- Imported price data is stored once and reused across sessions
- Back up everything to a single JSON file and restore it on another machine

## Data format

Import a CSV with either layout (header optional):

```
timestamp,open,high,low,close,volume
date,time,open,high,low,close,volume
```

Timestamps are read as wall-clock time (UTC) exactly as written in the file, independent of your browser's
time zone; `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYYMMDD` and epoch seconds/milliseconds are accepted.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Step back / forward (Shift = 10) |
| Home / End | Back to start / jump to end |
| + / − | Faster / slower |
| K, `[`, `]` | Add bookmark, previous / next bookmark |
| J | Trade journal |
| H T F R V B L S M | Drawing tools |

## Development

```sh
npm install
npm run dev      # start the app
npm test         # unit tests (replay engine, trade engine, storage, CSV parsing)
npm run build
```

Stack: Vite, React, TypeScript, Tailwind + shadcn/ui, lightweight-charts, Dexie (IndexedDB).
