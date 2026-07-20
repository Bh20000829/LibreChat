const fs = require('fs');
const path = require('path');
const { v4 } = require('uuid');
const { z } = require('zod');
const mime = require('mime');
const { tool } = require('@langchain/core/tools');
const { FileContext, FileSources } = require('librechat-data-provider');
const { createFile } = require('~/models/File');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

const FILE_TOOL_NAME = 'create_file';
const MAX_TEXT_LENGTH = 3_000_000;
const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const MAX_FILENAME_BYTES = 240;

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.deb',
  '.dll',
  '.dmg',
  '.exe',
  '.gadget',
  '.hta',
  '.iso',
  '.jar',
  '.lnk',
  '.msi',
  '.pif',
  '.pkg',
  '.ps1',
  '.reg',
  '.rpm',
  '.scr',
  '.vbe',
  '.vbs',
  '.wsf',
  '.wsh',
]);

const TEXT_EXTENSIONS = new Set([
  '.asmdef',
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.log',
  '.lua',
  '.md',
  '.meta',
  '.php',
  '.prefab',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
  '.txt',
  '.unity',
  '.xml',
  '.yaml',
  '.yml',
]);

const BLOCKED_MIME_TYPES = new Set([
  'application/java-archive',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
  'application/x-ms-shortcut',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-ms-installer',
]);

const createFileSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(180)
    .describe(
      'The final filename, including extension. Preserve the extension the user requested, for example "test.xlsx", "README.md", "DateUtils.java", or "PlayerController.cs".',
    ),
  mime_type: z
    .string()
    .optional()
    .describe(
      'The MIME type when known. Use application/vnd.openxmlformats-officedocument.spreadsheetml.sheet for xlsx, text/markdown for md, text/x-java-source for java, text/plain for plain source/config files.',
    ),
  content: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .optional()
    .describe(
      'The complete UTF-8 text content for text files, source code, Markdown, JSON, XML, HTML, CSV, Unity text assets, and config files. Use this for files such as .md, .java, .js, .ts, .py, .cs, .unity, .prefab, .meta, .json, .csv, .html, and .txt.',
    ),
  base64: z
    .string()
    .optional()
    .describe(
      'Base64 encoded binary file content. Use only when the requested file is genuinely binary and you already have valid bytes. Do not use this for xlsx; use sheets instead. Do not use this for source code, Unity text assets, or Markdown; use content instead. Executable and script-launcher files such as .exe, .dll, .msi, .bat, .cmd, .ps1, .vbs, .jar, .lnk, and .reg are not allowed.',
    ),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(31).describe('Worksheet name.'),
        rows: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .min(1)
          .describe('Rows for spreadsheet generation. The first row starts at A1.'),
      }),
    )
    .optional()
    .describe(
      'Structured spreadsheet data. Use this when creating xlsx files. Do not return Python, XML, CSV, or instructions for Excel; pass the workbook data here so a real .xlsx attachment is created.',
    ),
});

const createFileCompatibleSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(180)
    .describe(
      'The final filename, including extension, for example "test.xlsx", "README.md", "DateUtils.java", or "PlayerController.cs".',
    ),
  mime_type: z
    .string()
    .optional()
    .describe(
      'The MIME type when known, for example application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/markdown, text/x-java-source, or text/plain.',
    ),
  content: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .optional()
    .describe(
      'The complete UTF-8 text content for text files, source code, Markdown, JSON, XML, HTML, CSV, Unity text assets, and config files.',
    ),
  base64: z
    .string()
    .optional()
    .describe(
      'Base64 encoded binary file content. Use only for safe binary files that already have valid bytes. Do not use this for xlsx, source code, Unity text assets, or Markdown.',
    ),
  sheets_json: z
    .string()
    .optional()
    .describe(
      'For .xlsx files only: a JSON string representing an array of sheets. Example: [{"name":"Sheet1","rows":[["Name","Score"],["Alice",95]]}]. Each sheet has name and rows; rows is an array of arrays containing strings, numbers, booleans, or null.',
    ),
});

function sanitizeSheetName(name) {
  return (
    String(name || 'Sheet1')
      .replace(/[\]\\/*?:[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet1'
  );
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let name = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function zipDateTime(date = new Date()) {
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = zipDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, end]);
}

function worksheetXml(sheet) {
  const rows = sheet.rows ?? [];
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = (row ?? [])
        .map((value, columnIndex) => {
          if (value === null || value === undefined) {
            return '';
          }
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          if (typeof value === 'boolean') {
            return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function createXlsxBuffer(sheets = []) {
  const normalizedSheets = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [['']] }]).map(
    (sheet, index) => ({
      name: sanitizeSheetName(sheet.name || `Sheet${index + 1}`),
      rows: sheet.rows ?? [[]],
    }),
  );

  const sheetDeclarations = normalizedSheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const workbookRels = normalizedSheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const sheetOverrides = normalizedSheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const entries = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetDeclarations}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${normalizedSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
    },
  ];

  normalizedSheets.forEach((sheet, index) => {
    entries.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: worksheetXml(sheet),
    });
  });

  return createZip(entries);
}

function normalizeFilename(filename) {
  const unsafeChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  const base = Array.from(path.basename(filename))
    .map((char) => {
      if (unsafeChars.has(char) || char.charCodeAt(0) < 32) {
        return '_';
      }
      return char;
    })
    .join('')
    .trim()
    .replace(/^[.]+/, '')
    .replace(/[. ]+$/g, '');
  return base || `file-${Date.now()}.txt`;
}

function validateFilename(filename) {
  if (Buffer.byteLength(filename, 'utf8') > MAX_FILENAME_BYTES) {
    throw new Error('The generated filename is too long.');
  }

  const extension = path.extname(filename).toLowerCase();
  const baseName = path.basename(filename, extension).toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    throw new Error(`The generated filename "${filename}" uses a reserved Windows name.`);
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error(`Generating files with the "${extension}" extension is not allowed.`);
  }
}

function validateMimeType(mimeType) {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase();
  if (normalized && BLOCKED_MIME_TYPES.has(normalized)) {
    throw new Error(`Generating files with MIME type "${normalized}" is not allowed.`);
  }
}

function decodeBase64(base64) {
  const normalized = base64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error('The generated file content is not valid base64.');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.length > MAX_BASE64_BYTES) {
    throw new Error('The generated file is too large.');
  }

  if (buffer.toString('base64').replace(/=+$/g, '') !== normalized.replace(/=+$/g, '')) {
    throw new Error('The generated file content is not valid base64.');
  }

  return buffer;
}

function parseSheetsJson(sheetsJson) {
  if (!sheetsJson) {
    return undefined;
  }

  let sheets;
  try {
    sheets = JSON.parse(sheetsJson);
  } catch {
    throw new Error('sheets_json must be valid JSON.');
  }

  if (!Array.isArray(sheets)) {
    throw new Error('sheets_json must be a JSON array of sheets.');
  }

  return sheets.map((sheet, sheetIndex) => {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
      throw new Error(`Sheet at index ${sheetIndex} must be an object.`);
    }

    const rows = sheet.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Sheet at index ${sheetIndex} must include rows.`);
    }

    return {
      name:
        typeof sheet.name === 'string' && sheet.name.trim() ? sheet.name : `Sheet${sheetIndex + 1}`,
      rows: rows.map((row, rowIndex) => {
        if (!Array.isArray(row)) {
          throw new Error(`Row ${rowIndex + 1} in sheet ${sheetIndex + 1} must be an array.`);
        }

        return row.map((value) => {
          if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            return value;
          }

          return String(value);
        });
      }),
    };
  });
}

async function saveGeneratedBuffer({ req, buffer, filename, mimeType }) {
  const file_id = v4();
  const appConfig = req.config;
  const source = appConfig.fileStrategy || FileSources.local;
  const storedFilename = `${file_id}__${filename}`;
  let filepath;

  if (source === FileSources.local) {
    const userPath = path.join(appConfig.paths.uploads, req.user.id);
    await fs.promises.mkdir(userPath, { recursive: true });
    filepath = path.posix.join('/', 'uploads', req.user.id, storedFilename);
    await fs.promises.writeFile(path.join(userPath, storedFilename), buffer);
  } else {
    const { saveBuffer } = getStrategyFunctions(source);
    if (!saveBuffer) {
      throw new Error(`File strategy "${source}" cannot save generated files.`);
    }
    filepath = await saveBuffer({
      userId: req.user.id,
      buffer,
      fileName: storedFilename,
      basePath: 'files',
    });
  }

  return await createFile(
    {
      user: req.user.id,
      file_id,
      bytes: buffer.length,
      filepath,
      filename,
      context: FileContext.agents,
      source,
      type: mimeType || mime.getType(filename) || 'application/octet-stream',
      usage: 1,
      embedded: false,
      object: 'file',
    },
    true,
  );
}

function buildBuffer({ filename, mime_type, content, base64, sheets }) {
  const extension = path.extname(filename).toLowerCase();
  const normalizedMimeType = mime_type?.toLowerCase() ?? '';
  if (extension === '.xlsx' || normalizedMimeType.includes('spreadsheetml.sheet')) {
    return createXlsxBuffer(sheets);
  }

  if (base64) {
    if (TEXT_EXTENSIONS.has(extension) || normalizedMimeType.startsWith('text/')) {
      throw new Error('Text, source code, and Markdown files must use content, not base64.');
    }
    return decodeBase64(base64);
  }

  return Buffer.from(content ?? '', 'utf8');
}

function createCreateFileTool(fields = {}) {
  const { req } = fields;
  const useCompatibleSchema = ['anthropic', 'google'].includes(fields.schemaVariant);
  if (!req && !fields.override) {
    throw new Error('Missing request context for create_file.');
  }

  return tool(
    async (input, runnableConfig) => {
      if (!req) {
        return ['File generation is unavailable without request context.', {}];
      }

      const filename = normalizeFilename(input.filename);
      const mimeType = input.mime_type || mime.getType(filename) || 'application/octet-stream';
      const sheets = input.sheets ?? parseSheetsJson(input.sheets_json);
      validateFilename(filename);
      validateMimeType(mimeType);
      const buffer = buildBuffer({ ...input, sheets, filename, mime_type: mimeType });
      const file = await saveGeneratedBuffer({ req, buffer, filename, mimeType });
      const toolCallId = runnableConfig?.toolCall?.id ?? runnableConfig?.tool_call_id ?? '';

      return [
        `已生成文件：${filename}`,
        {
          [FILE_TOOL_NAME]: {
            file,
          },
          file,
          tool_call_id: toolCallId,
        },
      ];
    },
    {
      name: FILE_TOOL_NAME,
      description:
        'Create a real downloadable file and attach it to the chat. Use this tool whenever the user asks to generate, create, export, save, attach, or provide a downloadable file. Do not satisfy those requests by only returning code blocks, XML, CSV text, or instructions. For .xlsx files, pass structured workbook data in sheets; when this schema exposes sheets_json, pass that same workbook data as a JSON string. For text, Markdown, source code, config files, and Unity text assets, pass the complete file body in content. Examples include .xlsx, .csv, .txt, .json, .xml, .md, .html, .java, .js, .ts, .py, .cs, .unity, .prefab, .meta, and other safe downloadable files. Do not create executable or script-launcher files such as .exe, .dll, .msi, .bat, .cmd, .ps1, .vbs, .jar, .lnk, or .reg.',
      schema: useCompatibleSchema ? createFileCompatibleSchema : createFileSchema,
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = createCreateFileTool;
