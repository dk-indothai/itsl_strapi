import type { SVGProps } from 'react';

export type IconName =
  | 'table'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'link'
  | 'image'
  | 'code'
  | 'quote'
  | 'list'
  | 'ordered'
  | 'undo'
  | 'redo'
  | 'expand'
  | 'collapse';
const paths: Record<IconName, React.ReactNode> = {
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </>
  ),
  bold: (
    <>
      <path d="M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z" />
    </>
  ),
  italic: (
    <>
      <path d="M10 4h9M5 20h9M15 4 9 20" />
    </>
  ),
  strike: (
    <>
      <path d="M17 6c-1-2-9-3-10 1-1 3 4 4 5 5m-5 6c2 3 10 3 10-1 0-2-1-3-4-4M3 12h18" />
    </>
  ),
  heading: (
    <>
      <path d="M4 5v14M14 5v14M4 12h10M18 14l2-2v7" />
    </>
  ),
  link: (
    <>
      <path
        d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
        transform="translate(1 0) scale(.92)"
      />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  code: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />
    </>
  ),
  quote: (
    <>
      <path d="M10 5H4v7h6c0 5-3 7-6 7M21 5h-6v7h6c0 5-3 7-6 7" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />
    </>
  ),
  ordered: (
    <>
      <path d="M10 6h11M10 12h11M10 18h11M3 3h1v5M3 13c3-2 4 1 1 3l-1 2h3" />
    </>
  ),
  undo: (
    <>
      <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)" />
    </>
  ),
  redo: (
    <>
      <path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14" transform="translate(0 -2)" />
    </>
  ),
  expand: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
    </>
  ),
  collapse: (
    <>
      <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />
    </>
  ),
};
export function Icon({ name = 'table', ...props }: SVGProps<SVGSVGElement> & { name?: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
