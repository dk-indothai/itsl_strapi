import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export type Alignment = 'left' | 'center' | 'right' | null;
export interface TableData {
  headers: string[];
  rows: string[][];
  align: Alignment[];
}
export interface TableRange {
  start: number;
  end: number;
  table: TableData;
}
export interface TextEdit {
  value: string;
  start: number;
  end: number;
}
export const MAX_COLUMNS = 20;
export const MAX_ROWS = 100;
const parser = unified().use(remarkParse).use(remarkGfm);

export interface MarkdownBlock {
  start: number;
  end: number;
  type: string;
}

/** Source ranges let inline edits preserve every other block verbatim. */
export function findBlocks(value: string): MarkdownBlock[] {
  return parser.parse(value).children.flatMap((node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined ? [] : [{ start, end, type: node.type }];
  });
}
export function replaceBlock(value: string, block: MarkdownBlock, text: string): string {
  const eol = value.includes('\r\n') ? '\r\n' : '\n';
  return value.slice(0, block.start) + text.replace(/\r?\n/g, eol) + value.slice(block.end);
}

export function createTable(columns = 3, rows = 2): TableData {
  if (
    !Number.isInteger(columns) ||
    columns < 1 ||
    columns > MAX_COLUMNS ||
    !Number.isInteger(rows) ||
    rows < 0 ||
    rows > MAX_ROWS
  ) {
    throw new RangeError('Table dimensions are outside the supported range.');
  }
  return {
    headers: Array.from({ length: columns }, () => ''),
    rows: Array.from({ length: rows }, () => Array<string>(columns).fill('')),
    align: Array<Alignment>(columns).fill(null),
  };
}

// Cells hold Markdown source. Preserve existing escapes, and escape new literal pipes.
export function escapeCell(value: string): string {
  const text = value.replace(/\r?\n/g, ' ').trim();
  let result = '';
  let slashes = 0;
  for (const char of text) {
    if (char === '|' && slashes % 2 === 0) result += '\\';
    result += char;
    slashes = char === '\\' ? slashes + 1 : 0;
  }
  // A trailing backslash must not escape the delimiter when serialized.
  if (slashes % 2 === 1) result += '\\';
  return result;
}

export function serializeTable(table: TableData): string {
  if (!table.headers.length || table.rows.some((row) => row.length !== table.headers.length)) {
    throw new Error('Every table row must have the same number of cells.');
  }
  const line = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
  const separators = table.headers.map((_, i) => {
    switch (table.align[i]) {
      case 'left':
        return ':---';
      case 'center':
        return ':---:';
      case 'right':
        return '---:';
      default:
        return '---';
    }
  });
  return [line(table.headers), line(separators), ...table.rows.map(line)].join('\n');
}

export function splitTableRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cell = '';
  let slashes = 0;
  for (const char of text) {
    if (char === '|' && slashes % 2 === 0) {
      cells.push(cell.trim());
      cell = '';
    } else cell += char;
    slashes = char === '\\' ? slashes + 1 : 0;
  }
  cells.push(cell.trim());
  if (text.startsWith('|')) cells.shift();
  if (cells[cells.length - 1] === '' && /(?<!\\)(?:\\\\)*\|$/.test(text)) cells.pop();
  return cells;
}

/** Use the GFM parser to exclude code blocks, prose and nested tables safely. */
export function findTables(value: string): TableRange[] {
  const tree = parser.parse(value);
  return tree.children.flatMap((node) => {
    if (node.type !== 'table') return [];
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return [];
    const lines = value.slice(start, end).split(/\r?\n/);
    const headers = splitTableRow(lines[0]);
    const rows = lines.slice(2).map(splitTableRow);
    // Do not silently discard cells that GFM would otherwise ignore.
    if (rows.some((row) => row.length > headers.length)) return [];
    return [
      {
        start,
        end,
        table: {
          headers,
          rows: rows.map((row) => headers.map((_, i) => row[i] ?? '')),
          align: node.align ?? headers.map(() => null),
        },
      },
    ];
  });
}

export function findTableAt(value: string, cursor: number): TableRange | undefined {
  return findTables(value).find(({ start, end }) => cursor >= start && cursor <= end);
}

export function insertBlock(value: string, start: number, end: number, block: string): TextEdit {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const eol = value.includes('\r\n') ? '\r\n' : '\n';
  const normalized = block.replace(/\r?\n/g, eol);
  const prefix = before
    ? before.endsWith(eol + eol)
      ? ''
      : before.endsWith(eol)
        ? eol
        : eol + eol
    : '';
  const suffix = after
    ? after.startsWith(eol + eol)
      ? ''
      : after.startsWith(eol)
        ? eol
        : eol + eol
    : eol + eol;
  const text = prefix + normalized + suffix;
  return { value: before + text + after, start: start + text.length, end: start + text.length };
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after = before,
  placeholder = 'text',
): TextEdit {
  const selected = value.slice(start, end) || placeholder;
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + selected.length,
  };
}

export function prefixLines(value: string, start: number, end: number, prefix: string): TextEdit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const selection = value.slice(lineStart, end);
  const replaced = selection
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
  return {
    value: value.slice(0, lineStart) + replaced + value.slice(end),
    start: lineStart,
    end: lineStart + replaced.length,
  };
}

/** Change complete selected lines, replacing existing ATX markers instead of nesting them. */
export function setHeading(value: string, start: number, end: number, level: number): TextEdit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const lastSelected = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextLine = value.indexOf('\n', lastSelected);
  const lineEnd = nextLine === -1 ? value.length : nextLine;
  const marker = '#'.repeat(level) + ' ';
  const replaced = value
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) => {
      const existing = /^ {0,3}#{1,6}(?:[ \t]+|(?=\r?$))/;
      const content = existing.test(line)
        ? line.replace(existing, '').replace(/[ \t]+#+[ \t]*(?=\r?$)/, '')
        : line;
      return marker + content;
    })
    .join('\n');
  return {
    value: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
    start: lineStart + marker.length,
    end: lineStart + replaced.length,
  };
}
