import { useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ChartView } from '@/components/ChartView';
import { parseCSV, type OHLCVBar } from '@/lib/csvParser';
import { toast } from 'sonner';

const Index = () => {
  const [bars, setBars] = useState<OHLCVBar[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const parsed = await parseCSV(file);
      setBars(parsed);
      setFileName(file.name.replace('.csv', ''));
      toast.success(`Loaded ${parsed.length} bars from ${file.name}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to parse CSV');
    } finally {
      setIsLoading(false);
    }
  };

  if (!bars) {
    return <FileUpload onFileSelected={handleFile} isLoading={isLoading} />;
  }

  return (
    <ChartView
      rawBars={bars}
      fileName={fileName}
      onReset={() => { setBars(null); setFileName(''); }}
    />
  );
};

export default Index;
