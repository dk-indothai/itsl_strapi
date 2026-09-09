import { createContext, useContext, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { styled } from 'styled-components';
import { useTranslation } from '../useTranslation';
import {
  MAX_COLUMNS,
  MAX_ROWS,
  type Alignment,
  type TableData,
  type TableRange,
} from '../utils/markdown';
import { ToolButton, ToolSelect } from './styles';

interface TableContextValue {
  value: string;
  tables: TableRange[];
  onChange: (range: TableRange, table: TableData) => void;
  onUndo: (redo?: boolean) => void;
}
const TableContext = createContext<TableContextValue | null>(null);
const Surface = styled.div`
  margin-bottom: 20px;
  min-width: 0;
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .controls button,
  .controls select {
    font-size: 1.2rem;
  }
  .controls select {
    max-width: 145px;
  }
  .scroll {
    overflow: auto;
  }
  && table {
    margin: 0;
  }
  && th,
  && td {
    padding: 0;
    min-width: 110px;
  }
  .cell {
    border: 0;
    border-radius: 0;
    width: 100%;
    min-width: 110px;
    padding: 11px 12px;
    background: transparent;
    color: var(--mt-text);
    font: inherit;
  }
  th .cell {
    font-weight: 600;
  }
  .cell:hover {
    background: var(--mt-accent-soft);
  }
  .cell:focus {
    background: var(--mt-bg);
    outline: 2px solid var(--mt-accent);
    outline-offset: -2px;
  }
  .cell::placeholder {
    color: var(--mt-muted);
    font-weight: 400;
  }
  .help {
    color: var(--mt-muted);
    font-size: 1.2rem;
    margin: 6px 0 0;
  }
`;

// Keep a cell draft until blur/Enter so typing spaces and IME composition stay intact.
// An externally replaced document invalidates that draft instead of overwriting new content.
function Cell({
  value,
  revision,
  label,
  placeholder,
  align,
  onFocus,
  onCommit,
  onUndo,
}: {
  value: string;
  revision: string;
  label: string;
  placeholder?: string;
  align: Alignment;
  onFocus: () => void;
  onCommit: (value: string) => void;
  onUndo: (redo?: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ value: string; revision: string } | null>(null);
  const currentDraft = draft?.revision === revision ? draft : null;
  return (
    <input
      className="cell"
      aria-label={label}
      placeholder={placeholder}
      style={{ textAlign: align ?? 'left' }}
      value={currentDraft?.value ?? value}
      onFocus={onFocus}
      onChange={(event) => setDraft({ value: event.target.value, revision })}
      onBlur={() => {
        if (currentDraft && currentDraft.value !== value) onCommit(currentDraft.value);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(null);
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          ['z', 'y'].includes(event.key.toLowerCase()) &&
          !currentDraft
        ) {
          event.preventDefault();
          onUndo(event.key.toLowerCase() === 'y' || event.shiftKey);
        }
      }}
    />
  );
}

function InlineTable({ node, children, ...props }: ComponentPropsWithoutRef<'table'> & ExtraProps) {
  const context = useContext(TableContext);
  const t = useTranslation();
  const [active, setActive] = useState({ row: -1, column: 0 });
  const range = context?.tables.find((table) => table.start === node?.position?.start.offset);
  if (
    !context ||
    !range ||
    range.table.headers.length > MAX_COLUMNS ||
    range.table.rows.length > MAX_ROWS
  ) {
    return <table {...props}>{children}</table>;
  }
  const table = range.table;
  const column = Math.min(active.column, table.headers.length - 1);
  const row = Math.min(active.row, table.rows.length - 1);
  const update = (next: TableData) => context.onChange(range, next);
  const cell = (value: string, r: number, c: number) => (
    <Cell
      value={value}
      revision={context.value}
      onUndo={context.onUndo}
      label={
        r < 0
          ? t('table.headerLabel', 'Column {column} header', { column: c + 1 })
          : t('table.cellLabel', 'Row {row}, column {column}', { row: r + 1, column: c + 1 })
      }
      placeholder={
        r < 0 ? t('table.headerPlaceholder', 'Heading {column}', { column: c + 1 }) : undefined
      }
      align={table.align[c]}
      onFocus={() => setActive({ row: r, column: c })}
      onCommit={(next) =>
        update(
          r < 0
            ? { ...table, headers: table.headers.map((v, i) => (i === c ? next : v)) }
            : {
                ...table,
                rows: table.rows.map((cells, i) =>
                  i === r ? cells.map((v, j) => (j === c ? next : v)) : cells,
                ),
              },
        )
      }
    />
  );
  return (
    <Surface data-table-start={range.start}>
      <div className="controls" role="group" aria-label={t('table.controls', 'Table controls')}>
        <ToolButton
          type="button"
          disabled={table.rows.length >= MAX_ROWS}
          title={t('table.addRowHelp', 'Add a row after the selected row')}
          onClick={() =>
            update({
              ...table,
              rows: [
                ...table.rows.slice(0, row + 1),
                table.headers.map(() => ''),
                ...table.rows.slice(row + 1),
              ],
            })
          }
        >
          {t('table.addRow', '+ Row')}
        </ToolButton>
        <ToolButton
          type="button"
          disabled={table.headers.length >= MAX_COLUMNS}
          title={t('table.addColumnHelp', 'Add a column after the selected column')}
          onClick={() => {
            const add = <T,>(values: T[], item: T) => [
              ...values.slice(0, column + 1),
              item,
              ...values.slice(column + 1),
            ];
            update({
              headers: add(table.headers, ''),
              rows: table.rows.map((cells) => add(cells, '')),
              align: add(table.align, null),
            });
          }}
        >
          {t('table.addColumn', '+ Column')}
        </ToolButton>
        <ToolSelect
          aria-label={t('table.alignSelected', 'Selected column alignment')}
          value={table.align[column] ?? ''}
          onChange={(event) =>
            update({
              ...table,
              align: table.align.map((v, i) =>
                i === column ? ((event.target.value || null) as Alignment) : v,
              ),
            })
          }
        >
          <option value="">{t('table.defaultAlign', 'Alignment')}</option>
          <option value="left">{t('table.left', 'Align left')}</option>
          <option value="center">{t('table.center', 'Align center')}</option>
          <option value="right">{t('table.right', 'Align right')}</option>
        </ToolSelect>
        <ToolButton
          type="button"
          disabled={row < 0}
          title={t('table.removeRowHelp', 'Remove the selected row. Undo restores it.')}
          onClick={() => update({ ...table, rows: table.rows.filter((_, i) => i !== row) })}
        >
          {t('table.removeRow', '− Row')}
        </ToolButton>
        <ToolButton
          type="button"
          disabled={table.headers.length <= 1}
          title={t('table.removeColumnHelp', 'Remove the selected column. Undo restores it.')}
          onClick={() =>
            update({
              headers: table.headers.filter((_, i) => i !== column),
              rows: table.rows.map((cells) => cells.filter((_, i) => i !== column)),
              align: table.align.filter((_, i) => i !== column),
            })
          }
        >
          {t('table.removeColumn', '− Column')}
        </ToolButton>
      </div>
      <div className="scroll">
        <table aria-label={t('table.editable', 'Editable table')}>
          <thead>
            <tr>
              {table.headers.map((header, c) => (
                <th key={c} scope="col">
                  {cell(header, -1, c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((cells, r) => (
              <tr key={r}>
                {cells.map((value, c) => (
                  <td key={c}>{cell(value, r, c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help">
        {t('table.inlineHelp', 'Tab between cells · Enter to finish · Undo restores changes')}
      </p>
    </Surface>
  );
}

const components: Components = { table: InlineTable };
export function EditablePreview({ value, tables, onChange, onUndo }: TableContextValue) {
  return (
    <TableContext.Provider value={{ value, tables, onChange, onUndo }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {value}
      </ReactMarkdown>
    </TableContext.Provider>
  );
}
