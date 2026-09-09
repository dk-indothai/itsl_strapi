import { describe, expect, it } from 'vitest';
import {
  createTable,
  escapeCell,
  findTableAt,
  findTables,
  insertBlock,
  prefixLines,
  serializeTable,
  splitTableRow,
  wrapSelection,
  findBlocks,
  replaceBlock,
  setHeading,
} from '../../admin/src/utils/markdown';

describe('GFM tables', () => {
  it('serializes headers, rows, and alignment and parses them back', () => {
    const table = {
      headers: ['Plan', 'Price', 'Details'],
      rows: [['Basic', '$10', '**Included**']],
      align: ['left', 'right', 'center'] as const,
    };
    const markdown = serializeTable({ ...table, align: [...table.align] });
    expect(markdown).toContain('| :--- | ---: | :---: |');
    expect(findTables(markdown)[0].table).toEqual(table);
  });
  it('preserves Markdown escapes and inline formatting on repeated edits', () => {
    const markdown = '| Header | Code |\n| --- | --- |\n| A \\| B | `a\\|b` |';
    expect(serializeTable(findTables(markdown)[0].table)).toBe(markdown);
    expect(escapeCell('A | B')).toBe('A \\| B');
    expect(escapeCell('A \\| B')).toBe('A \\| B');
  });
  it('handles leading/trailing pipes and escaped backslashes', () => {
    expect(splitTableRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitTableRow('a | b')).toEqual(['a', 'b']);
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
    expect(splitTableRow('| a\\\\ | c |')).toEqual(['a\\\\', 'c']);
  });
  it('protects literal pipes after an escaped slash and terminal backslashes', () => {
    expect(escapeCell('a\\\\|b')).toBe('a\\\\\\|b');
    expect(escapeCell('path\\')).toBe('path\\\\');
    expect(escapeCell('line one\nline two')).toBe('line one line two');
  });
  it('ignores fenced and indented code, nested blockquotes, and ordinary prose', () => {
    const table = '| H |\n| --- |\n| v |';
    expect(findTables('```md\n' + table + '\n```')).toEqual([]);
    expect(
      findTables(
        table
          .split('\n')
          .map((line) => '    ' + line)
          .join('\n'),
      ),
    ).toEqual([]);
    expect(
      findTables(
        table
          .split('\n')
          .map((line) => '> ' + line)
          .join('\n'),
      ),
    ).toEqual([]);
    expect(findTables('hello | world')).toEqual([]);
  });
  it('locates only the table at the caret and leaves surrounding content intact', () => {
    const table = serializeTable(createTable(2, 1));
    const value = `Before\n\n${table}\n\nAfter\n\n${table}`;
    const range = findTableAt(value, 10)!;
    expect(value.slice(range.start, range.end)).toBe(table);
    expect(value.slice(0, range.start)).toBe('Before\n\n');
    expect(findTableAt(value, 0)).toBeUndefined();
    expect(findTables(value)).toHaveLength(2);
  });
  it('pads incomplete rows but refuses to discard extra source cells', () => {
    expect(findTables('a | b\n--- | ---\none |')[0].table.rows).toEqual([['one', '']]);
    expect(findTables('a | b\n--- | ---\none | two | three')).toEqual([]);
  });
  it('supports header-only tables and bounds generated table size', () => {
    expect(findTables(serializeTable(createTable(1, 0)))[0].table.rows).toEqual([]);
    expect(() => createTable(0, 2)).toThrow(RangeError);
    expect(() => createTable(21, 2)).toThrow(RangeError);
    expect(() => createTable(2, 101)).toThrow(RangeError);
    expect(() => createTable(2.5, 2)).toThrow(RangeError);
  });
});

describe('source editing', () => {
  it('replaces one interactive block without normalizing unrelated Markdown', () => {
    const original = '## Heading\r\n\r\nOld text\r\n\r\n| Table |\r\n| ----- |\r\n| keep  |';
    const blocks = findBlocks(original);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'table']);
    expect(replaceBlock(original, blocks[1], 'New\ntext')).toBe(
      original.replace('Old text', 'New\r\ntext'),
    );
  });
  it('inserts a block at a selection with blank lines around it', () => {
    expect(insertBlock('beforeSELECTafter', 6, 12, 'TABLE').value).toBe('before\n\nTABLE\n\nafter');
    expect(insertBlock('', 0, 0, 'TABLE').value).toBe('TABLE\n\n');
    expect(insertBlock('before\n\nafter', 8, 8, 'TABLE').value).toBe('before\n\nTABLE\n\nafter');
  });
  it('retains CRLF line endings', () => {
    expect(insertBlock('before\r\n', 8, 8, 'a\nb').value).toBe('before\r\n\r\na\r\nb\r\n\r\n');
  });
  it('wraps selected text and selects only the content', () => {
    expect(wrapSelection('Hello world', 6, 11, '**')).toEqual({
      value: 'Hello **world**',
      start: 8,
      end: 13,
    });
  });
  it('prefixes whole selected lines', () => {
    expect(prefixLines('one\ntwo\nthree', 1, 7, '- ').value).toBe('- one\n- two\nthree');
  });
  it('replaces heading markers for all six levels without stacking them', () => {
    for (let level = 1; level <= 6; level++) {
      expect(setHeading('Before\n\n## Title ##\n\nAfter', 12, 12, level).value).toBe(
        `Before\n\n${'#'.repeat(level)} Title\n\nAfter`,
      );
    }
  });
  it('changes complete selected lines and preserves CRLF and following content', () => {
    const value = 'First\r\n## Second\r\nUntouched';
    expect(setHeading(value, 2, value.indexOf('Untouched'), 4).value).toBe(
      '#### First\r\n#### Second\r\nUntouched',
    );
  });
  it('creates headings on empty lines and preserves literal hashes', () => {
    expect(setHeading('', 0, 0, 6)).toEqual({ value: '###### ', start: 7, end: 7 });
    expect(setHeading('#hashtag', 2, 2, 1).value).toBe('# #hashtag');
  });
});
