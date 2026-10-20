import { Upload, FileSpreadsheet } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

/** CSV drop zone. Data never leaves this machine; it is parsed in the browser and stored locally. */
export function FileUpload({ onFileSelected, isLoading }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) onFileSelected(file);
  }, [onFileSelected]);

  return (
    <div
      className={`panel p-8 text-center cursor-pointer transition-all duration-200 ${
        dragOver ? 'border-primary glow-primary' : 'hover:border-muted-foreground/30'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isLoading && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />
      <div className="flex flex-col items-center gap-3">
        {isLoading ? (
          <>
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Importing price data…</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet size={28} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Import OHLCV data</h2>
              <p className="text-sm text-muted-foreground">Drop a CSV file or click to browse</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <Upload size={14} />
              <span>date,time,O,H,L,C,V or timestamp,O,H,L,C,V</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
