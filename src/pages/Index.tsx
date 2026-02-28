import { useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ChartView } from '@/components/ChartView';
import { parseCSV, type OHLCVBar } from '@/lib/csvParser';
import { type SavedProject } from '@/lib/projectStorage';
import { toast } from 'sonner';

const Index = () => {
  const [bars, setBars] = useState<OHLCVBar[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadedProject, setLoadedProject] = useState<SavedProject | null>(null);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const text = await file.text();
      setCsvText(text);
      const parsed = await parseCSV(file);
      setBars(parsed);
      setFileName(file.name.replace('.csv', ''));
      setLoadedProject(null);
      toast.success(`Loaded ${parsed.length} bars from ${file.name}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to parse CSV');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadProject = async (project: SavedProject) => {
    try {
      const blob = new Blob([project.csvData], { type: 'text/csv' });
      const file = new File([blob], project.fileName + '.csv');
      const parsed = await parseCSV(file);
      setBars(parsed);
      setFileName(project.fileName);
      setCsvText(project.csvData);
      setLoadedProject(project);
      toast.success(`Loaded project "${project.name}"`);
    } catch (e: any) {
      toast.error('Failed to load project: ' + (e.message || 'Unknown error'));
    }
  };

  if (!bars) {
    return <FileUpload onFileSelected={handleFile} isLoading={isLoading} />;
  }

  return (
    <ChartView
      rawBars={bars}
      fileName={fileName}
      csvText={csvText}
      loadedProject={loadedProject}
      onLoadProject={handleLoadProject}
      onReset={() => { setBars(null); setFileName(''); setCsvText(''); setLoadedProject(null); }}
    />
  );
};

export default Index;
