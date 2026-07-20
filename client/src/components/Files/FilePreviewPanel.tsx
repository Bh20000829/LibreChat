import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { Button, Spinner, useToastContext } from '@librechat/client';
import type { FilePreviewItem } from '~/store/filePreview';
import { useCodeOutputDownload, useFileDownload, useFilePreview } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type SpreadsheetPreview = {
  kind: 'spreadsheet';
  name: string;
  rows: string[][];
};

type TextPreview = {
  kind: 'text';
  content: string;
};

type ImagePreview = {
  kind: 'image';
};

type PdfPreview = {
  kind: 'pdf';
};

type EmptyPreview = {
  kind: 'empty';
};

type PreviewState = SpreadsheetPreview | TextPreview | ImagePreview | PdfPreview | EmptyPreview;

type ZipEntry = {
  method: number;
  compressedSize: number;
  localOffset: number;
};

const MAX_TEXT_BYTES = 500000;
const MAX_ROWS = 80;
const MAX_COLUMNS = 26;
const MIN_VISIBLE_ROWS = 30;
const MIN_VISIBLE_COLUMNS = 15;

const textExtensions = new Set([
  'asmdef',
  'bat',
  'c',
  'cpp',
  'cs',
  'css',
  'csv',
  'go',
  'h',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'log',
  'lua',
  'md',
  'meta',
  'php',
  'prefab',
  'ps1',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'swift',
  'ts',
  'tsx',
  'txt',
  'unity',
  'xml',
  'yaml',
  'yml',
]);

const getExtension = (filename?: string) => filename?.split('.').pop()?.toLowerCase() ?? '';

const columnIndex = (cellRef: string) => {
  const letters = cellRef.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const rowIndex = (cellRef: string) => {
  const row = Number(cellRef.match(/\d+/)?.[0] ?? '1');
  return Number.isFinite(row) && row > 0 ? row - 1 : 0;
};

const readString = (view: DataView, offset: number, length: number) => {
  const bytes = new Uint8Array(view.buffer, offset, length);
  return new TextDecoder().decode(bytes);
};

const inflateEntry = async (view: DataView, entry: ZipEntry) => {
  const localNameLength = view.getUint16(entry.localOffset + 26, true);
  const localExtraLength = view.getUint16(entry.localOffset + 28, true);
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  const data = new Uint8Array(view.buffer, dataOffset, entry.compressedSize);

  if (entry.method === 0) {
    return data;
  }
  if (entry.method === 8) {
    let rawData: ArrayBuffer;
    if (data.buffer instanceof ArrayBuffer) {
      rawData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      rawData = copy.buffer;
    }
    const stream = new Blob([rawData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new Uint8Array();
};

const readZip = async (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  let eocdOffset = -1;

  for (let offset = view.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    return new Map<string, Uint8Array>();
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      break;
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const filename = readString(view, cursor + 46, nameLength);
    const entry = { method, compressedSize, localOffset };

    entries.set(filename, await inflateEntry(view, entry));
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const getXml = (entries: Map<string, Uint8Array>, path: string) => {
  const data = entries.get(path);
  if (!data) {
    return null;
  }

  return new DOMParser().parseFromString(new TextDecoder().decode(data), 'application/xml');
};

const textFromNode = (node: Element) => {
  return Array.from(node.getElementsByTagName('t'))
    .map((textNode) => textNode.textContent ?? '')
    .join('');
};

const resolveSheetPath = (relationshipTarget: string) => {
  if (relationshipTarget.startsWith('/')) {
    return relationshipTarget.replace(/^\//, '');
  }
  if (relationshipTarget.startsWith('xl/')) {
    return relationshipTarget;
  }
  return `xl/${relationshipTarget}`;
};

const parseXlsx = async (buffer: ArrayBuffer): Promise<SpreadsheetPreview | null> => {
  const entries = await readZip(buffer);
  const workbook = getXml(entries, 'xl/workbook.xml');
  const relationships = getXml(entries, 'xl/_rels/workbook.xml.rels');
  const sharedStringsXml = getXml(entries, 'xl/sharedStrings.xml');

  if (!workbook || !relationships) {
    return null;
  }

  const firstSheet = workbook.getElementsByTagName('sheet')[0];
  const relationshipId = firstSheet?.getAttribute('r:id');
  const sheetName = firstSheet?.getAttribute('name') ?? '';
  const relationship = Array.from(relationships.getElementsByTagName('Relationship')).find(
    (item) => item.getAttribute('Id') === relationshipId,
  );
  const sheetTarget = relationship?.getAttribute('Target');

  if (!sheetTarget) {
    return null;
  }

  const worksheet = getXml(entries, resolveSheetPath(sheetTarget));
  if (!worksheet) {
    return null;
  }

  const sharedStrings = sharedStringsXml
    ? Array.from(sharedStringsXml.getElementsByTagName('si')).map(textFromNode)
    : [];
  const rows: string[][] = [];

  Array.from(worksheet.getElementsByTagName('c')).forEach((cell) => {
    const ref = cell.getAttribute('r') ?? 'A1';
    const row = rowIndex(ref);
    const column = columnIndex(ref);

    if (row >= MAX_ROWS || column >= MAX_COLUMNS) {
      return;
    }

    const type = cell.getAttribute('t');
    const valueNode = cell.getElementsByTagName('v')[0];
    let value = valueNode?.textContent ?? '';

    if (type === 's') {
      value = sharedStrings[Number(value)] ?? value;
    } else if (type === 'inlineStr') {
      value = textFromNode(cell);
    } else if (type === 'b') {
      value = value === '1' ? 'TRUE' : 'FALSE';
    }

    rows[row] = rows[row] ?? [];
    rows[row][column] = value;
  });

  return { kind: 'spreadsheet', name: sheetName, rows };
};

const parsePreview = async (
  blob: Blob,
  item: NonNullable<FilePreviewItem>,
): Promise<PreviewState> => {
  const extension = getExtension(item.filename);
  const type = item.type ?? '';

  if (type.startsWith('image/') || ['gif', 'jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    return { kind: 'image' };
  }
  if (type === 'application/pdf' || extension === 'pdf') {
    return { kind: 'pdf' };
  }
  if (extension === 'xlsx') {
    return (await parseXlsx(await blob.arrayBuffer())) ?? { kind: 'empty' };
  }
  if (textExtensions.has(extension) || type.startsWith('text/') || type.includes('json')) {
    const content = await blob.slice(0, MAX_TEXT_BYTES).text();
    return { kind: 'text', content };
  }

  return { kind: 'empty' };
};

const SpreadsheetTable = ({ preview }: { preview: SpreadsheetPreview }) => {
  const maxColumnCount = Math.max(1, ...preview.rows.map((row) => row?.length ?? 0));
  const columnCount = Math.min(MAX_COLUMNS, Math.max(MIN_VISIBLE_COLUMNS, maxColumnCount));
  const rowCount = Math.min(MAX_ROWS, Math.max(MIN_VISIBLE_ROWS, preview.rows.length));
  const columns = Array.from({ length: columnCount }, (_, index) =>
    String.fromCharCode('A'.charCodeAt(0) + index),
  );

  return (
    <div className="h-full overflow-auto bg-surface-primary">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 h-8 w-10 border border-border-light bg-surface-secondary" />
            {columns.map((column) => (
              <th
                key={column}
                className="sticky top-0 z-10 h-8 min-w-28 border border-border-light bg-surface-secondary px-2 text-center font-medium text-text-secondary"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr key={row}>
              <th className="sticky left-0 z-10 h-8 border border-border-light bg-surface-secondary px-2 text-right font-medium text-text-secondary">
                {row + 1}
              </th>
              {columns.map((column, columnPosition) => {
                const cell = preview.rows[row]?.[columnPosition] ?? '';
                return (
                  <td
                    key={`${row}-${column}`}
                    className={cn(
                      'h-8 min-w-28 border border-border-light px-2 align-middle text-text-primary',
                      row === 0 && columnPosition === 0 ? 'outline outline-2 outline-blue-500' : '',
                    )}
                    title={cell}
                  >
                    <div className="max-w-56 truncate">{cell}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function FilePreviewPanel({ item }: { item: NonNullable<FilePreviewItem> }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const setFilePreview = useSetRecoilState(store.filePreview);
  const [objectUrl, setObjectUrl] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fileId = item.file_id ?? '';
  const filepath = item.filepath ?? item.preview ?? '';
  const filename = item.filename ?? localize('com_ui_files');
  const userId = item.user ?? user?.id ?? '';
  const { refetch: refetchFileDownload } = useFileDownload(userId, fileId);
  const { refetch: refetchFilePreview } = useFilePreview(userId, fileId);
  const { refetch: refetchCodeOutputDownload } = useCodeOutputDownload(fileId ? '' : filepath);

  const downloadObjectUrl = useCallback(async () => {
    const stream = fileId ? await refetchFileDownload() : await refetchCodeOutputDownload();
    return stream.data ?? '';
  }, [fileId, refetchCodeOutputDownload, refetchFileDownload]);

  const previewObjectUrl = useCallback(async () => {
    const stream = fileId ? await refetchFilePreview() : await refetchCodeOutputDownload();
    return stream.data ?? '';
  }, [fileId, refetchCodeOutputDownload, refetchFilePreview]);

  const handleDownload = useCallback(async () => {
    try {
      const shouldRevokeAfterDownload = !objectUrl;
      const url = objectUrl || (await downloadObjectUrl());
      if (!url) {
        showToast({ status: 'error', message: localize('com_ui_download_error') });
        return;
      }

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (shouldRevokeAfterDownload) {
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      showToast({ status: 'error', message: localize('com_ui_download_error') });
    }
  }, [downloadObjectUrl, filename, localize, objectUrl, showToast]);

  useEffect(() => {
    let active = true;
    let currentObjectUrl = '';

    setIsLoading(true);
    setHasError(false);
    setPreview(null);
    setObjectUrl('');

    const loadPreview = async () => {
      try {
        const url = await previewObjectUrl();
        if (!active || !url) {
          return;
        }

        currentObjectUrl = url;
        setObjectUrl(url);
        const response = await fetch(url);
        const blob = await response.blob();
        const nextPreview = await parsePreview(blob, item);

        if (active) {
          setPreview(nextPreview);
        }
      } catch (error) {
        console.error('Error loading file preview:', error);
        if (active) {
          setHasError(true);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      active = false;
      if (currentObjectUrl) {
        window.URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [item, previewObjectUrl]);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner size={24} />
        </div>
      );
    }

    if (hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-text-secondary">
          {localize('com_ui_download_error')}
        </div>
      );
    }

    if (preview?.kind === 'empty' || !preview) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <div className="text-sm font-medium text-text-primary">
              {localize('com_nav_not_supported')}
            </div>
            <div className="mt-1 max-w-80 truncate text-xs text-text-secondary" title={filename}>
              {filename}
            </div>
          </div>
        </div>
      );
    }

    if (preview.kind === 'spreadsheet') {
      return <SpreadsheetTable preview={preview} />;
    }

    if (preview.kind === 'image') {
      return (
        <div className="flex h-full items-center justify-center overflow-auto bg-surface-primary p-4">
          <img src={objectUrl} alt={filename} className="max-h-full max-w-full object-contain" />
        </div>
      );
    }

    if (preview.kind === 'pdf') {
      return (
        <iframe
          src={objectUrl}
          title={filename}
          className="h-full w-full border-0 bg-surface-primary"
        />
      );
    }

    return (
      <pre className="h-full overflow-auto whitespace-pre-wrap bg-surface-primary p-4 text-sm text-text-primary">
        {preview.content}
      </pre>
    );
  }, [filename, hasError, isLoading, localize, objectUrl, preview]);

  return (
    <section className="flex h-full flex-col bg-surface-primary text-text-primary">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-light px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={filename}>
            {filename}
          </div>
          <div className="truncate text-xs text-text-secondary">{item.type ?? item.source}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDownload}
            aria-label={localize('com_ui_download')}
          >
            <Download size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFilePreview(null)}
            aria-label={localize('com_ui_close')}
          >
            <X size={16} />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
    </section>
  );
}
