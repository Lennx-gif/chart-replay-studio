import { Upload, FileSpreadsheet } from 'lucide-react';
import { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelected, isLoading }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      onFileSelected(file);
    }
  }, [onFileSelected]);

  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div
        className={`panel p-12 max-w-lg w-full text-center cursor-pointer transition-all duration-200 ${
          dragOver ? 'border-primary glow-primary scale-[1.02]' : 'hover:border-muted-foreground/30'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) onFileSelected(file);
          };
          input.click();
        }}
      >
        <div className="flex flex-col items-center gap-4">
          {isLoading ? (
            <>
              <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground text-sm">Parsing CSV data...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet size={32} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Load OHLCV Data</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Drop a CSV file or click to browse
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <Upload size={14} />
                <span>Supports: date,time,O,H,L,C,V or timestamp,O,H,L,C,V</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
