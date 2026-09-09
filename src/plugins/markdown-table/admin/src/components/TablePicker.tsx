import { useRef, useState } from 'react';
import { Popover } from '@strapi/design-system';
import { styled } from 'styled-components';
import { Icon } from './Icon';
import { surface, ToolButton } from './styles';
import { useTranslation } from '../useTranslation';

const COLUMNS = 6;
const ROWS = 5;
const Picker = styled(Popover.Content)`
  ${surface}
  width: min(280px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--mt-border);
  border-radius: 6px;
  background: var(--mt-bg);
  .size {
    font-weight: 600;
    margin-bottom: 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
  }
  .square {
    aspect-ratio: 1;
    min-width: 0;
    border: 1px solid var(--mt-border);
    border-radius: 3px;
    background: var(--mt-soft);
  }
  .square[data-selected='true'] {
    background: var(--mt-accent-soft);
    border-color: var(--mt-accent);
  }
  .square:hover {
    border-color: var(--mt-accent);
  }
  .help {
    margin-top: 12px;
    font-size: 1.2rem;
    color: var(--mt-muted);
  }
`;

interface Props {
  disabled: boolean;
  onOpen: () => void;
  onInsert: (columns: number, rows: number) => void;
}

export function TablePicker({ disabled, onOpen, onInsert }: Props) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ columns: 3, rows: 3 });
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const inserting = useRef(false);
  return (
    <Popover.Root
      open={open && !disabled}
      onOpenChange={(next) => {
        if (next) {
          inserting.current = false;
          onOpen();
          setSize({ columns: 3, rows: 3 });
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger>
        <ToolButton
          type="button"
          $primary
          disabled={disabled}
          title={t('table.insert', 'Insert table')}
        >
          <Icon name="table" />
          {t('table', 'Table')}
        </ToolButton>
      </Popover.Trigger>
      <Picker
        align="start"
        sideOffset={6}
        collisionPadding={16}
        aria-label={t('table.chooseSize', 'Choose table size')}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cells.current[14]?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (inserting.current) event.preventDefault();
        }}
      >
        <p className="size" role="status">
          {t('table.size', '{columns} × {rows} table', size)}
        </p>
        <div className="grid" role="group" aria-label={t('table.chooseSize', 'Choose table size')}>
          {Array.from({ length: COLUMNS * ROWS }, (_, index) => {
            const column = (index % COLUMNS) + 1;
            const row = Math.floor(index / COLUMNS) + 1;
            return (
              <button
                key={index}
                ref={(element) => {
                  cells.current[index] = element;
                }}
                type="button"
                className="square"
                tabIndex={column === size.columns && row === size.rows ? 0 : -1}
                data-selected={column <= size.columns && row <= size.rows}
                aria-label={t('table.insertSize', 'Insert {columns} columns and {rows} rows', {
                  columns: column,
                  rows: row,
                })}
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') setSize({ columns: column, rows: row });
                }}
                onFocus={() => setSize({ columns: column, rows: row })}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  const delta = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -COLUMNS,
                    ArrowDown: COLUMNS,
                  }[event.key];
                  if (delta === undefined) return;
                  event.preventDefault();
                  const next = Math.max(0, Math.min(COLUMNS * ROWS - 1, index + delta));
                  cells.current[next]?.focus();
                }}
                onClick={() => {
                  inserting.current = true;
                  setOpen(false);
                  onInsert(column, row);
                }}
              />
            );
          })}
        </div>
        <p className="help">
          {t('table.pickerHelp', 'First row is the header. Add more rows or columns anytime.')}
        </p>
      </Picker>
    </Popover.Root>
  );
}
