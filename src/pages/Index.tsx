import { useState } from 'react';
import { HomeDashboard } from '@/components/HomeDashboard';
import { ChartView } from '@/components/ChartView';
import { parseCSV, detectBaseTimeframe, type OHLCVBar } from '@/lib/csvParser';
import {
  saveDataset,
  listDatasets,
  listSessions,
  generateUUID,
  type StoredDataset,
  type BacktestSession,
} from '@/lib/db/localDatabase';
import { toast } from 'sonner';

const Index = () => {
  const [bars, setBars] = useState<OHLCVBar[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDataset, setCurrentDataset] = useState<StoredDataset | null>(null);
  const [activeSession, setActiveSession] = useState<BacktestSession | null>(null);

  // Parse and save uploaded CSV into local database
  const handleUploadFile = async (file: File) => {
    setIsLoading(true);
    try {
      const text = await file.text();
      setCsvText(text);
      const parsed = await parseCSV(file);
      const baseTf = detectBaseTimeframe(parsed);
      const symbol = file.name.replace('.csv', '').toUpperCase();

      const datasetId = generateUUID();
      const dataset: StoredDataset = {
        id: datasetId,
        name: file.name.replace('.csv', ''),
        symbol,
        baseTimeframe: baseTf,
        barCount: parsed.length,
        startTime: parsed[0]?.time || 0,
        endTime: parsed[parsed.length - 1]?.time || 0,
        bars: parsed,
        source: 'upload',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveDataset(dataset);
      toast.success(`Dataset "${symbol}" imported successfully (${parsed.length.toLocaleString()} bars)!`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to parse CSV');
    } finally {
      setIsLoading(false);
    }
  };

  // Launch a session directly into the ChartView
  const handleLaunchSession = (dataset: StoredDataset, session: BacktestSession) => {
    setCurrentDataset(dataset);
    setBars(dataset.bars);
    setFileName(dataset.symbol);
    setActiveSession(session);
    toast.success(`Launching "${session.name}"...`);
  };

  // Offline symbol switch handler from within chart
  const handleSymbolChange = async (symbol: string) => {
    const list = await listDatasets();
    const match = list.find((d) => d.symbol.toUpperCase() === symbol.toUpperCase());
    if (match) {
      const sessList = await listSessions(match.id);
      if (sessList.length > 0) {
        handleLaunchSession(match, sessList[0]);
      } else {
        const fallbackSession: BacktestSession = {
          id: generateUUID(),
          name: `${match.symbol} Replay`,
          datasetId: match.id,
          symbol: match.symbol,
          timeframe: match.baseTimeframe,
          currentTimestamp: match.bars[Math.min(50, match.bars.length - 1)]?.time || 0,
          speed: 1,
          stepMode: 'bar',
          stepMinutes: match.baseTimeframe,
          dateFilter: { mode: 'all' },
          drawings: [],
          orders: [],
          startingBalance: 10000,
          leverage: 30,
          notes: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        handleLaunchSession(match, fallbackSession);
      }
      return;
    }

    // Try bundled samples
    if (symbol.toUpperCase().includes('EUR')) {
      const res = await fetch('/samples/EURUSD_1H.csv');
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const file = new File([blob], 'EURUSD_1H.csv', { type: 'text/csv' });
        await handleUploadFile(file);
        return;
      }
    } else if (symbol.toUpperCase().includes('BTC')) {
      const res = await fetch('/samples/BTCUSD_1D.csv');
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const file = new File([blob], 'BTCUSD_1D.csv', { type: 'text/csv' });
        await handleUploadFile(file);
        return;
      }
    }

    toast.error(`Symbol ${symbol} not found in local library. Upload it from the dashboard!`);
  };

  // Return to homepage dashboard
  const handleBackToDashboard = () => {
    setBars(null);
    setFileName('');
    setCsvText('');
    setCurrentDataset(null);
    setActiveSession(null);
  };

  // If no dataset/session is launched, render the rich HomeDashboard
  if (!bars || !activeSession) {
    return (
      <HomeDashboard
        onLaunchSession={handleLaunchSession}
        onUploadFile={handleUploadFile}
        isLoading={isLoading}
      />
    );
  }

  return (
    <ChartView
      rawBars={bars}
      fileName={fileName}
      csvText={csvText}
      dataset={currentDataset}
      initialSession={activeSession}
      onSymbolChange={handleSymbolChange}
      onReset={handleBackToDashboard}
    />
  );
};

export default Index;
