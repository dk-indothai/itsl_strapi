import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { styled } from 'styled-components';
import {
  findBlocks,
  findTables,
  wrapSelection,
  setHeading,
  type MarkdownBlock,
  type TextEdit,
  type TableData,
} from '../utils/markdown';
import { EditablePreview } from './InlineTable';
import { useTranslation } from '../useTranslation';
import { ToolButton } from './styles';

type Transform = (value: string, start: number, end: number) => TextEdit;
interface BlockEditorHandle {
  focus: () => void;
  transform: (transform: Transform) => boolean;
  heading: (level: number) => boolean;
}
export interface InteractiveDocumentHandle {
  focus: () => void;
  transform: (transform: Transform) => boolean;
  heading: (level: number) => boolean;
}

const BlockSurface = styled.div`
  margin-bottom: 12px;
  .read-block {
    display: block;
    width: 100%;
    min-height: 36px;
    padding: 6px;
    margin: -6px;
    text-align: start;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: text;
  }
  .read-block:hover {
    color: var(--mt-accent);
  }
  .read-block:focus-visible {
    outline: 2px solid var(--mt-accent);
    outline-offset: 2px;
  }
  .block-heading {
    display: block;
    font-weight: 600;
    line-height: 1.35;
  }
  .block-h1 {
    font-size: 2.8rem;
  }
  .block-h2 {
    font-size: 2.2rem;
  }
  .block-h3 {
    font-size: 1.8rem;
  }
  .block-h4 {
    font-size: 1.6rem;
  }
  .block-h5 {
    font-size: 1.4rem;
  }
  .block-h6 {
    font-size: 1.2rem;
  }
  .block-paragraph {
    display: block;
  }
  .block-list {
    display: block;
    padding-inline-start: 24px;
  }
  .block-list-item {
    display: list-item;
    list-style-type: disc;
  }
  .block-ordered > .block-list-item {
    list-style-type: decimal;
  }
  .block-quote {
    display: block;
    padding-inline-start: 16px;
    border-inline-start: 3px solid var(--mt-border);
    color: var(--mt-muted);
  }
  .block-code {
    display: block;
    padding: 16px;
    white-space: pre-wrap;
    background: var(--mt-soft);
  }
  .block-link {
    color: var(--mt-accent);
    text-decoration: underline;
  }
  .block-rule {
    display: block;
    border-top: 1px solid var(--mt-border);
    margin-block: 12px;
  }
  .block-input {
    width: 100%;
    min-height: 48px;
    padding: 6px;
    margin: -6px;
    border: 0;
    border-radius: 0;
    resize: none;
    overflow: hidden;
    font: inherit;
    line-height: 1.7;
    color: var(--mt-text);
    background: transparent;
  }
  && .block-input:focus-visible {
    outline: none;
    box-shadow: inset 0 -2px 0 var(--mt-accent);
  }
`;
// Buttons contain phrasing content only. Links are displayed here; Preview owns navigation.
const span =
  (className: string) =>
  ({ children }: { children?: ReactNode }) => <span className={className}>{children}</span>;
const readComponents: Components = {
  p: span('block-paragraph'),
  h1: span('block-heading block-h1'),
  h2: span('block-heading block-h2'),
  h3: span('block-heading block-h3'),
  h4: span('block-heading block-h4'),
  h5: span('block-heading block-h5'),
  h6: span('block-heading block-h6'),
  ul: span('block-list'),
  ol: span('block-list block-ordered'),
  li: span('block-list-item'),
  blockquote: span('block-quote'),
  pre: span('block-code'),
  a: span('block-link'),
  hr: () => <span className="block-rule" />,
  input: ({ checked }) => <span>{checked ? '☑ ' : '☐ '}</span>,
  table: span('block-paragraph'),
  thead: span('block-paragraph'),
  tbody: span('block-paragraph'),
  tr: span('block-paragraph'),
  th: span('block-paragraph'),
  td: span('block-paragraph'),
};

const TextBlock = forwardRef<
  BlockEditorHandle,
  {
    text: string;
    revision: string;
    type: string;
    initialEditing?: boolean;
    active: boolean;
    onActivate: () => void;
    onCommit: (text: string) => void;
    onUndo: (redo?: boolean) => void;
  }
>(function TextBlock(
  { text, revision, type, initialEditing = false, active, onActivate, onCommit, onUndo },
  ref,
) {
  const t = useTranslation();
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState({ text, revision });
  const input = useRef<HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const validDraft = draft.revision === revision;
  const current = validDraft ? draft.text : text;
  // Hide heading syntax while editing; preserve its original marker on commit.
  const prefix = type === 'heading' ? (text.match(/^#{1,6}\s+/)?.[0] ?? '') : '';
  const display = prefix && current.startsWith(prefix) ? current.slice(prefix.length) : current;
  const grow = () => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = `${input.current.scrollHeight}px`;
    }
  };
  const activate = () => {
    cancelled.current = false;
    onActivate();
    setDraft({ text, revision });
    setEditing(true);
  };
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      grow();
    }
  }, [editing]);
  useEffect(() => {
    if (!active) setEditing(false);
  }, [active]);
  useEffect(grow, [display]);
  useImperativeHandle(ref, () => ({
    focus() {
      if (editing) input.current?.focus();
      else button.current?.click();
    },
    transform(transform) {
      if (!editing || !input.current) return false;
      const edit = transform(display, input.current.selectionStart, input.current.selectionEnd);
      setDraft({ text: prefix + edit.value, revision });
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.setSelectionRange(edit.start, edit.end);
      });
      return true;
    },
    heading(level) {
      // Convert an underline-style heading as well as an existing # heading.
      const content =
        type === 'heading' ? current.replace(/\r?\n {0,3}(?:=+|-+)[ \t]*$/, '') : current;
      onCommit(setHeading(content, 0, content.length, level).value);
      return true;
    },
  }));
  return (
    <BlockSurface>
      {editing ? (
        <textarea
          ref={input}
          className="block-input resize-none"
          style={{ resize: 'none' }}
          value={display}
          aria-label={
            type === 'heading' ? t('block.heading', 'Edit heading') : t('block.text', 'Edit text')
          }
          placeholder={t('block.placeholder', 'Start writing…')}
          onChange={(event) => setDraft({ text: prefix + event.target.value, revision })}
          onBlur={() => {
            if (!cancelled.current && validDraft && current !== text) onCommit(current);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if ((event.metaKey || event.ctrlKey) && ['b', 'i'].includes(event.key.toLowerCase())) {
              event.preventDefault();
              const marker = event.key.toLowerCase() === 'b' ? '**' : '*';
              const edit = wrapSelection(
                display,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
                marker,
              );
              setDraft({ text: prefix + edit.value, revision });
              requestAnimationFrame(() => input.current?.setSelectionRange(edit.start, edit.end));
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelled.current = true;
              setEditing(false);
              requestAnimationFrame(() => button.current?.focus());
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
              setEditing(false);
            }
            if (
              (event.metaKey || event.ctrlKey) &&
              ['z', 'y'].includes(event.key.toLowerCase()) &&
              current === text
            ) {
              event.preventDefault();
              onUndo(event.key.toLowerCase() === 'y' || event.shiftKey);
            }
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          className="read-block"
          onClick={activate}
          aria-label={
            type === 'heading'
              ? t('block.editHeading', 'Edit heading: {text}', {
                  text: text.replace(/^#{1,6}\s+/, ''),
                })
              : t('block.editText', 'Edit text: {text}', { text: text.slice(0, 80) })
          }
        >
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={readComponents}>
              {text}
            </ReactMarkdown>
          ) : (
            t('block.placeholder', 'Start writing…')
          )}
        </button>
      )}
    </BlockSurface>
  );
});

export const InteractiveDocument = forwardRef<
  InteractiveDocumentHandle,
  {
    value: string;
    onChangeBlock: (block: MarkdownBlock, text: string) => void;
    onChangeTable: (block: MarkdownBlock, table: TableData) => void;
    onActivate: (position: number) => void;
    onUndo: (redo?: boolean) => void;
  }
>(function InteractiveDocument({ value, onChangeBlock, onChangeTable, onActivate, onUndo }, ref) {
  const t = useTranslation();
  const blocks = useMemo(() => findBlocks(value), [value]);
  const editors = useRef<(BlockEditorHandle | null)[]>([]);
  const active = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  useImperativeHandle(ref, () => ({
    focus: () => {
      const editor = editors.current[active.current] ?? editors.current.find(Boolean);
      editor?.focus();
    },
    transform: (transform) => editors.current[active.current]?.transform(transform) ?? false,
    heading: (level) => editors.current[active.current]?.heading(level) ?? false,
  }));
  return (
    <>
      {blocks.map((block, index) => {
        const text = value.slice(block.start, block.end);
        if (block.type === 'table')
          return (
            <div
              key={index}
              data-block-start={block.start}
              onFocusCapture={() => {
                active.current = -1;
                setActiveIndex(-1);
                onActivate(block.end);
              }}
            >
              <EditablePreview
                value={text}
                tables={findTables(text)}
                onChange={(_, table) => onChangeTable(block, table)}
                onUndo={onUndo}
              />
            </div>
          );
        return (
          <TextBlock
            key={index}
            active={activeIndex === index}
            ref={(instance) => {
              editors.current[index] = instance;
            }}
            text={text}
            revision={value}
            type={block.type}
            onActivate={() => {
              active.current = index;
              setActiveIndex(index);
              onActivate(block.end);
            }}
            onCommit={(next) => onChangeBlock(block, next)}
            onUndo={onUndo}
          />
        );
      })}
      {(adding || !blocks.length) && (
        <TextBlock
          key="new"
          active={activeIndex === blocks.length}
          ref={(instance) => {
            editors.current[blocks.length] = instance;
          }}
          text=""
          revision={value}
          type="paragraph"
          initialEditing
          onActivate={() => {
            active.current = blocks.length;
            setActiveIndex(blocks.length);
            onActivate(value.length);
          }}
          onCommit={(next) => {
            onChangeBlock({ start: value.length, end: value.length, type: 'new' }, next);
            setAdding(false);
          }}
          onUndo={onUndo}
        />
      )}
      {blocks.length > 0 && !adding && (
        <ToolButton
          type="button"
          onClick={() => {
            active.current = blocks.length;
            setActiveIndex(blocks.length);
            onActivate(value.length);
            setAdding(true);
          }}
        >
          {t('block.add', '+ Content')}
        </ToolButton>
      )}
    </>
  );
});
