import { styled, css } from 'styled-components';

// Strapi owns the theme. These aliases also follow custom host themes and dark mode.
export const surface = css`
  --mt-bg: ${({ theme }) => theme.colors.neutral0};
  --mt-soft: ${({ theme }) => theme.colors.neutral100};
  --mt-border: ${({ theme }) => theme.colors.neutral200};
  --mt-text: ${({ theme }) => theme.colors.neutral800};
  --mt-muted: ${({ theme }) => theme.colors.neutral600};
  --mt-accent: ${({ theme }) => theme.colors.primary600};
  --mt-accent-soft: ${({ theme }) => theme.colors.primary100};
  --mt-danger: ${({ theme }) => theme.colors.danger600};
  --mt-thumb: ${({ theme }) => theme.colors.neutral400};
  color: var(--mt-text);
  font-size: 1.4rem;
  line-height: 1.5;
  &,
  * {
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--mt-thumb) var(--mt-soft);
  }
  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  *::-webkit-scrollbar-track {
    background: var(--mt-soft);
  }
  *::-webkit-scrollbar-thumb {
    background: var(--mt-thumb);
    border: 2px solid var(--mt-soft);
    border-radius: 6px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: var(--mt-muted);
  }
  *::-webkit-scrollbar-thumb:active {
    background: var(--mt-accent);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  :is(button, input, textarea, select, a):focus-visible {
    outline: 2px solid var(--mt-accent);
    outline-offset: 3px;
  }
  @media (forced-colors: active) {
    &,
    * {
      scrollbar-color: auto;
    }
  }
`;

export const EditorShell = styled.div<{ $invalid?: boolean }>`
  ${surface}
  min-width: 0;
  width: 100%;
  border: 1px solid ${({ $invalid }) => ($invalid ? 'var(--mt-danger)' : 'var(--mt-border)')};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: var(--mt-bg);
  &:focus-within {
    border-color: ${({ $invalid }) => ($invalid ? 'var(--mt-danger)' : 'var(--mt-accent)')};
  }
`;

export const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--mt-border);
`;
export const ToolButton = styled.button<{ $active?: boolean; $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: ${({ $active, $primary }) => ($active || $primary ? 'var(--mt-accent-soft)' : 'transparent')};
  color: ${({ $active, $primary }) => ($active || $primary ? 'var(--mt-accent)' : 'var(--mt-muted)')};
  font-weight: 600;
  &:hover:not(:disabled) {
    background: var(--mt-soft);
    color: var(--mt-accent);
  }
  &:active:not(:disabled) {
    background: var(--mt-accent-soft);
  }
  @media (pointer: coarse) {
    min-width: 44px;
    min-height: 44px;
  }
`;
export const Divider = styled.span`
  width: 1px;
  height: 20px;
  background: var(--mt-border);
  margin: 0 4px;
`;
// Native popups are intentional for the compact heading and alignment controls.
export const ToolSelect = styled.select`
  max-width: 100%;
  min-height: 34px;
  padding: 6px;
  border: 1px solid var(--mt-border);
  border-radius: 4px;
  font: inherit;
  background: var(--mt-bg);
  color: var(--mt-text);
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: var(--mt-accent);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  @media (pointer: coarse) {
    min-height: 44px;
  }
`;
export const ModeBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--mt-border);
  background: var(--mt-soft);
`;
export const Source = styled.textarea<{ $expanded: boolean }>`
  display: block;
  width: 100%;
  min-width: 0;
  height: ${({ $expanded }) => ($expanded ? '65vh' : '360px')};
  padding: 20px;
  border: 0;
  border-radius: 0;
  resize: none;
  background: var(--mt-bg);
  color: var(--mt-text);
  font:
    1.3rem/1.9 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
  tab-size: 2;
  overflow: auto;
  scrollbar-gutter: stable;
  &::placeholder {
    color: var(--mt-muted);
  }
  &:disabled {
    color: var(--mt-muted);
    background: var(--mt-soft);
  }
  &:focus-visible {
    outline-offset: -3px;
  }
`;
export const Preview = styled.div<{ $expanded: boolean }>`
  min-width: 0;
  padding: 20px;
  overflow: auto;
  overflow-wrap: anywhere;
  height: ${({ $expanded }) => ($expanded ? '65vh' : '360px')};
  & > :first-child {
    margin-top: 0;
  }
  p,
  ul,
  ol,
  pre,
  blockquote,
  table {
    margin: 0 0 16px;
  }
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: 600;
    line-height: 1.35;
    margin: 24px 0 12px;
  }
  h1 {
    font-size: 2.8rem;
  }
  h2 {
    font-size: 2.2rem;
  }
  h3 {
    font-size: 1.8rem;
  }
  h4 {
    font-size: 1.6rem;
  }
  h5 {
    font-size: 1.4rem;
  }
  h6 {
    font-size: 1.2rem;
  }
  ul {
    list-style: disc;
    padding-inline-start: 24px;
  }
  ol {
    list-style: decimal;
    padding-inline-start: 24px;
  }
  a {
    color: var(--mt-accent);
    text-decoration: underline;
  }
  strong {
    font-weight: 700;
  }
  em {
    font-style: italic;
  }
  blockquote {
    padding-inline-start: 16px;
    border-inline-start: 3px solid var(--mt-border);
    color: var(--mt-muted);
  }
  pre {
    overflow: auto;
    padding: 16px;
    background: var(--mt-soft);
    border-radius: 4px;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: var(--mt-soft);
    padding: 2px 4px;
  }
  pre code {
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 1.3rem;
  }
  th,
  td {
    border: 1px solid var(--mt-border);
    padding: 10px 12px;
    min-width: 80px;
  }
  th {
    font-weight: 600;
    background: var(--mt-soft);
  }
  img {
    max-width: 100%;
    height: auto;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--mt-border);
    margin-block: 20px;
  }
`;
export const Footer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--mt-border);
  font-size: 1.2rem;
  color: var(--mt-muted);
`;
