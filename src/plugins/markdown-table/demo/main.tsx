import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, DesignSystemProvider, darkTheme, lightTheme } from '@strapi/design-system';
import { IntlProvider } from 'react-intl';
import { createGlobalStyle, styled } from 'styled-components';
import { MarkdownEditor, type MarkdownEditorHandle } from '../admin/src/components/MarkdownEditor';
import { Icon } from '../admin/src/components/Icon';
import { PLUGIN_NAME } from '../admin/src/pluginId';

const initial = `## A little more room for your ideas

Markdown keeps writing simple. Tables make the details easier to compare.

Select **Table**, choose a size, and start typing in its cells. Click any paragraph or heading to edit it. Use **Raw Markdown** when you want to see the source.

| Feature | Markdown | With this plugin |
| :--- | :---: | :---: |
| Headings & formatting | Yes | Yes |
| Quick table picker | — | Yes |
| Column alignment | Manual | One click |

Switch to **Preview** to see your finished content.
`;
const Global = createGlobalStyle`
  html { font-size: 62.5%; }
  body { margin: 0; background: ${({ theme }) => theme.colors.neutral100}; color: ${({ theme }) => theme.colors.neutral800}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 1.4rem; }
  *, *::before, *::after { box-sizing: border-box; }
  button { cursor: pointer; } button:disabled { cursor: not-allowed; }
  a { color: ${({ theme }) => theme.colors.primary600}; }
  :focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary600}; outline-offset: 3px; }
  *, html { scrollbar-width: thin; scrollbar-color: ${({ theme }) => theme.colors.neutral400} ${({ theme }) => theme.colors.neutral100}; }
`;
const Page = styled.main`
  width: min(1160px, calc(100% - 48px));
  margin: 0 auto;
  padding: 44px 0;
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 56px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .brand svg {
    width: 26px;
    height: 26px;
    color: ${({ theme }) => theme.colors.primary600};
  }
  .eyebrow {
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.primary600};
  }
  h1 {
    font-size: clamp(2.8rem, 4vw, 4rem);
    letter-spacing: -0.03em;
    line-height: 1.15;
    margin: 12px 0;
    font-weight: 600;
  }
  .intro {
    color: ${({ theme }) => theme.colors.neutral600};
    max-width: 650px;
    line-height: 1.7;
    margin-bottom: 28px;
    font-size: 1.6rem;
  }
  .panel {
    background: ${({ theme }) => theme.colors.neutral0};
    padding: 28px;
    border: 1px solid ${({ theme }) => theme.colors.neutral200};
    border-radius: 8px;
  }
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
  }
  .status {
    min-height: 22px;
    color: ${({ theme }) => theme.colors.neutral600};
  }
  .note {
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.neutral600};
    margin-top: 18px;
  }
  @media (max-width: 700px) {
    width: calc(100% - 24px);
    padding: 24px 0;
    header {
      margin-bottom: 32px;
    }
    .panel {
      padding: 14px;
    }
  }
`;

function App() {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [dark, setDark] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  return (
    <IntlProvider locale="en">
      <DesignSystemProvider locale="en" theme={dark ? darkTheme : lightTheme}>
        <Global />
        <Page>
          <header>
            <div className="brand">
              <Icon />
              {PLUGIN_NAME}
            </div>
            <Button type="button" variant="tertiary" onClick={() => setDark(!dark)}>
              {dark ? 'Light theme' : 'Dark theme'}
            </Button>
          </header>
          <p className="eyebrow">Strapi 5 · Custom field</p>
          <h1>Your words. A little more structured.</h1>
          <p className="intro">
            The familiar Markdown workflow, with a visual way to create tables. Write, arrange, and
            preview without leaving your content.
          </p>
          <form
            className="panel"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!value.trim()) {
                setError('Add some content before saving.');
                setStatus('');
                editorRef.current?.focus();
                return;
              }
              setSaved(value);
              setError('');
              setStatus('Demo draft saved in memory.');
            }}
          >
            <MarkdownEditor
              ref={editorRef}
              name="body"
              label="Content"
              required
              hint="Stored as plain Markdown. Tables use GitHub Flavored Markdown (GFM)."
              value={value}
              onChange={(next) => {
                setValue(next);
                setError('');
                setStatus('');
              }}
              error={error}
              disabled={disabled}
            />
            <div className="actions">
              <Button type="submit" disabled={disabled}>
                Save demo draft
              </Button>
              <Button
                type="button"
                variant="tertiary"
                disabled={disabled || value === saved}
                onClick={() => {
                  setValue(saved);
                  setError('');
                  setStatus('Saved demo draft restored.');
                }}
              >
                Restore saved draft
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setDisabled(!disabled)}>
                {disabled ? 'Enable editing' : 'Test read-only'}
              </Button>
            </div>
            <p className="status" role="status">
              {status || (value !== saved ? 'Unsaved changes' : '')}
            </p>
          </form>
          <p className="note">
            Local component demo · Saving here lasts until you reload. In Strapi, the Content
            Manager handles saving and publishing.
          </p>
        </Page>
      </DesignSystemProvider>
    </IntlProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
