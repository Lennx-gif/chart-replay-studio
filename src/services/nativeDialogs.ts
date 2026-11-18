import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

/**
 * Checks if the application is currently running inside the Tauri native desktop wrapper.
 */
export function isDesktopApp(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/**
 * Save JSON data to disk using native save dialog if in desktop mode,
 * or browser Blob download if running on web.
 */
export async function exportJsonFile(filename: string, data: unknown): Promise<boolean> {
  const jsonString = JSON.stringify(data, null, 2);

  if (isDesktopApp()) {
    try {
      const selectedPath = await save({
        defaultPath: filename,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (!selectedPath) return false; // User cancelled

      await writeTextFile(selectedPath, jsonString);
      return true;
    } catch (err) {
      console.warn('Native save dialog failed, falling back to web download:', err);
    }
  }

  // Web fallback: HTML5 Blob + <a> download
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Save CSV data to disk using native save dialog if in desktop mode,
 * or browser Blob download if running on web.
 */
export async function exportCsvFile(filename: string, csvContent: string): Promise<boolean> {
  if (isDesktopApp()) {
    try {
      const selectedPath = await save({
        defaultPath: filename,
        filters: [{ name: 'CSV Spreadsheets', extensions: ['csv'] }],
      });

      if (!selectedPath) return false; // User cancelled

      await writeTextFile(selectedPath, csvContent);
      return true;
    } catch (err) {
      console.warn('Native save CSV dialog failed, falling back to web download:', err);
    }
  }

  // Web fallback: HTML5 Blob + <a> download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Open a JSON file via native file dialog if in desktop mode,
 * returning the parsed content or null if cancelled.
 */
export async function pickAndReadJsonFile(): Promise<{ filename: string; content: string } | null> {
  if (!isDesktopApp()) return null;

  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!selected || typeof selected !== 'string') return null;

    const content = await readTextFile(selected);
    const filename = selected.split(/[/\\]/).pop() || 'backup.json';
    return { filename, content };
  } catch (err) {
    console.warn('Native open JSON dialog failed:', err);
    return null;
  }
}

/**
 * Pick a CSV file via native file dialog if in desktop mode,
 * constructing a standard DOM File object.
 */
export async function pickCsvFile(): Promise<File | null> {
  if (!isDesktopApp()) return null;

  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'CSV Spreadsheets', extensions: ['csv'] }],
    });

    if (!selected || typeof selected !== 'string') return null;

    const content = await readTextFile(selected);
    const filename = selected.split(/[/\\]/).pop() || 'dataset.csv';
    return new File([content], filename, { type: 'text/csv' });
  } catch (err) {
    console.warn('Native open CSV dialog failed:', err);
    return null;
  }
}
