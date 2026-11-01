import { JSDOM, VirtualConsole } from 'jsdom';

const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL', 'LI', 'TABLE', 'TR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'DL', 'DT', 'DD', 'HR',
]);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);

export function quietDom(html: string, url?: string) {
  const virtualConsole = new VirtualConsole(); // swallow CSS/HTML parse noise
  return new JSDOM(html, { url, virtualConsole });
}

/** Decode HTML entities, e.g. Greenhouse's "&lt;p&gt;" content. */
export function decodeEntities(s: string): string {
  return JSDOM.fragment(`<textarea>${s.replace(/<\/textarea/gi, '')}</textarea>`).textContent ?? s;
}

/** HTML to readable plain text: block elements become line breaks, list items get "- ". */
export function htmlToText(html: string): string {
  const doc = quietDom(`<!doctype html><body>${html}</body>`).window.document;
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === 'BR') {
      out.push('\n');
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    if (tag === 'LI') out.push('- ');
    node.childNodes.forEach(walk);
    if (block) out.push('\n');
  };
  doc.body.childNodes.forEach(walk);
  return normalizeText(out.join(''));
}

/** Collapse spaces (including non-breaking ones) within lines, and runs of blank lines. */
export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/^- *$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
