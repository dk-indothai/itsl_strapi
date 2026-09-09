import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Field } from '@strapi/design-system';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createTable,
  findTableAt,
  findBlocks,
  insertBlock,
  prefixLines,
  setHeading,
  serializeTable,
  wrapSelection,
  type TableData,
  type MarkdownBlock,
  replaceBlock,
  type TextEdit,
} from '../utils/markdown';
import { useTranslation } from '../useTranslation';
import { Icon, type IconName } from './Icon';
import { TablePicker } from './TablePicker';
import { InteractiveDocument, type InteractiveDocumentHandle } from './InteractiveDocument';
import {
  Divider,
  EditorShell,
  Footer,
  ModeBar,
  Preview,
  Source,
  Toolbar,
  ToolButton,
  ToolSelect,
} from './styles';

export interface MarkdownEditorProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  labelAction?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}
export interface MarkdownEditorHandle {
  focus: () => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      name,
      value,
      onChange,
      label,
      labelAction,
      hint,
      error,
      required,
      disabled = false,
      placeholder,
    },
    forwardedRef,
  ) {
    const t = useTranslation();
    const id = useId();
    const source = useRef<HTMLTextAreaElement>(null);
    const preview = useRef<HTMLDivElement>(null);
    const interactive = useRef<InteractiveDocumentHandle>(null);
    const interactivePosition = useRef(value.length);
    const insertion = useRef({ value, start: 0, end: 0 });
    const selection = useRef({ start: 0, end: 0 });
    const [mode, setMode] = useState<'editor' | 'preview'>('editor');
    const [raw, setRaw] = useState(false);
    const focusEditor = () => {
      setMode('editor');
      requestAnimationFrame(() => {
        if (raw) source.current?.focus();
        else interactive.current?.focus();
      });
    };
    useImperativeHandle(forwardedRef, () => ({ focus: focusEditor }));
    const [expanded, setExpanded] = useState(false);
    const [notice, setNotice] = useState('');
    const previewValue = useDeferredValue(value);
    const history = useRef({
      past: [] as string[],
      future: [] as string[],
      current: value,
      lastTyped: 0,
    });
    const [, refreshHistory] = useState(0);

    // Host resets, locale switches and document navigation start a new undo history.
    useEffect(() => {
      if (history.current.current !== value) {
        history.current = { past: [], future: [], current: value, lastTyped: 0 };
        interactivePosition.current = value.length;
        refreshHistory((n) => n + 1);
      }
    }, [value]);

    const commit = (next: string, typing = false) => {
      if (disabled || next === value) return;
      const h = history.current;
      const now = Date.now();
      if (!typing || now - h.lastTyped > 750 || h.future.length)
        h.past = [...h.past.slice(-99), value];
      h.future = [];
      h.current = next;
      h.lastTyped = typing ? now : 0;
      onChange(next);
      refreshHistory((n) => n + 1);
    };
    const focusSelection = (start: number, end: number) => {
      selection.current = { start, end };
      requestAnimationFrame(() => {
        if (raw) {
          source.current?.focus();
          source.current?.setSelectionRange(start, end);
        }
      });
    };
    const apply = (edit: TextEdit) => {
      commit(edit.value);
      focusSelection(edit.start, edit.end);
    };
    const currentSelection = () =>
      raw && source.current
        ? { start: source.current.selectionStart, end: source.current.selectionEnd }
        : {
            start: Math.min(interactivePosition.current, value.length),
            end: Math.min(interactivePosition.current, value.length),
          };
    const undo = (redo = false) => {
      if (disabled) return;
      const h = history.current;
      const stack = redo ? h.future : h.past;
      const next = stack.pop();
      if (next === undefined) return;
      (redo ? h.past : h.future).push(value);
      h.current = next;
      h.lastTyped = 0;
      onChange(next);
      refreshHistory((n) => n + 1);
      focusSelection(
        Math.min(selection.current.start, next.length),
        Math.min(selection.current.start, next.length),
      );
    };
    const format = (before: string, after = before, sample = t('sample.text', 'text')) => {
      const { start, end } = currentSelection();
      if (!raw) {
        if (
          !interactive.current?.transform((text, start, end) =>
            wrapSelection(text, start, end, before, after, sample),
          )
        ) {
          apply(insertBlock(value, start, end, before + sample + after));
        }
        return;
      }
      apply(wrapSelection(value, start, end, before, after, sample));
    };
    const prefix = (marker: string) => {
      const { start, end } = currentSelection();
      if (!raw) {
        if (
          !interactive.current?.transform((text, start, end) =>
            prefixLines(text, start, end, marker),
          )
        ) {
          apply(insertBlock(value, start, end, marker + t('sample.text', 'text')));
        }
        return;
      }
      apply(prefixLines(value, start, end, marker));
    };
    const heading = (level: number) => {
      if (disabled || mode === 'preview') return;
      const { start, end } = currentSelection();
      if (raw) apply(setHeading(value, start, end, level));
      else if (!interactive.current?.heading(level)) {
        apply(
          insertBlock(value, start, end, '#'.repeat(level) + ' ' + t('sample.heading', 'Heading')),
        );
      }
    };
    const insertTable = (columns: number, rows: number) => {
      if (disabled || insertion.current.value !== value) return;
      const { start, end } = insertion.current;
      const existing = findTableAt(value, start);
      const at = existing?.end ?? start;
      const edit = insertBlock(
        value,
        at,
        existing?.end ?? end,
        serializeTable(createTable(columns, rows - 1)),
      );
      commit(edit.value);
      setMode('editor');
      selection.current = { start: edit.start, end: edit.end };
      setNotice(t('table.inserted', 'Table inserted. Type directly in its cells.'));
      interactivePosition.current = edit.start;
      if (raw) focusSelection(edit.start, edit.end);
      else {
        const inserted = findBlocks(edit.value).find(
          (block) => block.type === 'table' && block.start >= at,
        );
        requestAnimationFrame(() =>
          preview.current
            ?.querySelector<HTMLInputElement>(`[data-block-start="${inserted?.start}"] input`)
            ?.focus(),
        );
      }
    };
    const updateBlock = (block: MarkdownBlock, text: string) => {
      if (disabled) return;
      const next =
        block.type === 'new'
          ? insertBlock(value, block.start, block.end, text).value
          : replaceBlock(value, block, text);
      interactivePosition.current = Math.min(block.start + text.length, next.length);
      commit(next);
    };
    const updateTable = (range: MarkdownBlock, table: TableData) => {
      if (disabled) return;
      updateBlock(range, serializeTable(table));
    };
    const tool = (icon: IconName, title: string, onClick: () => void, unavailable = false) => (
      <ToolButton
        key={icon}
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled || mode === 'preview' || unavailable}
        onMouseDown={(event) => {
          if (!raw && icon !== 'undo' && icon !== 'redo') event.preventDefault();
        }}
        onClick={onClick}
      >
        <Icon name={icon} />
      </ToolButton>
    );

    return (
      <Field.Root id={id} name={name} error={error} hint={hint} required={required}>
        <Field.Label id={`${id}-label`} action={labelAction} onClick={focusEditor}>
          {label ?? name}
        </Field.Label>
        <EditorShell $invalid={!!error}>
          <Toolbar role="group" aria-label={t('toolbar', 'Markdown formatting')}>
            <ToolSelect
              aria-label={t('heading.level', 'Heading level')}
              title={t('heading.level', 'Heading level')}
              value=""
              disabled={disabled || mode === 'preview'}
              onChange={(event) => heading(Number(event.target.value))}
            >
              <option value="" disabled>
                {t('headings', 'Headings')}
              </option>
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  {t('heading.option', 'Heading {level}', { level })}
                </option>
              ))}
            </ToolSelect>
            {tool('bold', t('bold', 'Bold (Ctrl or Command+B)'), () => format('**'))}
            {tool('italic', t('italic', 'Italic (Ctrl or Command+I)'), () => format('*'))}
            {tool('strike', t('strike', 'Strikethrough'), () => format('~~'))}
            <Divider aria-hidden="true" />
            {tool('list', t('list', 'Bulleted list'), () => prefix('- '))}
            {tool('ordered', t('ordered', 'Numbered list'), () => prefix('1. '))}
            {tool('quote', t('quote', 'Blockquote'), () => prefix('> '))}
            <Divider aria-hidden="true" />
            {tool('link', t('link', 'Insert link'), () =>
              format('[', '](https://example.com)', t('sample.link', 'link text')),
            )}
            {tool('image', t('image', 'Insert image URL'), () =>
              format(
                '![',
                '](https://example.com/image.jpg)',
                t('sample.image', 'image description'),
              ),
            )}
            {tool('code', t('code', 'Inline code'), () => format('`'))}
            <Divider aria-hidden="true" />
            <TablePicker
              disabled={disabled || mode === 'preview'}
              onOpen={() => {
                insertion.current = { value, ...currentSelection() };
              }}
              onInsert={insertTable}
            />
            <div style={{ flex: 1 }} />
            {tool('undo', t('undo', 'Undo'), () => undo(), !history.current.past.length)}
            {tool('redo', t('redo', 'Redo'), () => undo(true), !history.current.future.length)}
          </Toolbar>
          <ModeBar role="group" aria-label={t('view', 'Editor view')}>
            {(['editor', 'preview'] as const).map((view) => (
              <ToolButton
                type="button"
                key={view}
                $active={mode === view}
                aria-pressed={mode === view}
                onClick={() => setMode(view)}
              >
                {t(`view.${view}`, { editor: 'Editor', preview: 'Preview' }[view])}
              </ToolButton>
            ))}
            <div style={{ flex: 1 }} />
            {mode === 'editor' && (
              <ToolButton
                type="button"
                $active={raw}
                aria-pressed={raw}
                onClick={() => setRaw(!raw)}
              >
                <Icon name="code" />
                {t('view.raw', 'Raw Markdown')}
              </ToolButton>
            )}
            <ToolButton
              type="button"
              aria-label={
                expanded ? t('collapse', 'Collapse editor') : t('expand', 'Expand editor')
              }
              title={expanded ? t('collapse', 'Collapse editor') : t('expand', 'Expand editor')}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <Icon name={expanded ? 'collapse' : 'expand'} />
            </ToolButton>
          </ModeBar>
          {mode === 'editor' && raw && (
            <Source
              ref={source}
              id={id}
              name={name}
              value={value}
              disabled={disabled}
              required={required}
              $expanded={expanded}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
              placeholder={placeholder ?? t('placeholder', 'Start writing in Markdown…')}
              spellCheck={false}
              onChange={(event) => commit(event.target.value, true)}
              onSelect={(event) => {
                selection.current = {
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                };
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || disabled) return;
                if (event.metaKey || event.ctrlKey) {
                  switch (event.key.toLowerCase()) {
                    case 'b':
                      event.preventDefault();
                      format('**');
                      break;
                    case 'i':
                      event.preventDefault();
                      format('*');
                      break;
                    case 'z':
                      event.preventDefault();
                      undo(event.shiftKey);
                      break;
                    case 'y':
                      event.preventDefault();
                      undo(true);
                      break;
                  }
                }
              }}
            />
          )}
          {mode === 'editor' && !raw && (
            <Preview
              ref={preview}
              id={id}
              $expanded={expanded}
              role="group"
              aria-labelledby={`${id}-label`}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            >
              {disabled ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                  {value}
                </ReactMarkdown>
              ) : (
                <InteractiveDocument
                  ref={interactive}
                  value={value}
                  onChangeBlock={updateBlock}
                  onChangeTable={updateTable}
                  onActivate={(position) => {
                    interactivePosition.current = position;
                  }}
                  onUndo={undo}
                />
              )}
            </Preview>
          )}
          {mode === 'preview' && (
            <Preview
              $expanded={expanded}
              role="region"
              aria-label={t('preview.label', 'Markdown preview')}
              tabIndex={0}
            >
              {previewValue.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                  {previewValue}
                </ReactMarkdown>
              ) : (
                <p style={{ color: 'var(--mt-muted)' }}>
                  {t(
                    'preview.empty',
                    'Your formatted content will appear here. Start writing or add a table.',
                  )}
                </p>
              )}
            </Preview>
          )}
          <Footer>
            <span>
              {t(
                raw ? 'footer.raw' : 'footer.interactive',
                raw
                  ? 'Edit the Markdown source directly.'
                  : 'Click text to edit · Tab between table cells · Raw Markdown shows the source.',
              )}
            </span>
            <span>{t('footer.count', '{count} characters', { count: value.length })}</span>
          </Footer>
          {notice && <Footer role="status">{notice}</Footer>}
        </EditorShell>
        <Field.Hint />
        <Field.Error />
      </Field.Root>
    );
  },
);
