/**
 * A tiny, dependency-free, **safe** Markdown renderer for trip notes.
 *
 * Notes are the user's own text, but we still treat them as untrusted: every
 * character of user content is HTML-escaped *first*, and only a fixed, known-safe
 * set of tags (headings, emphasis, code, lists, links, blockquotes, rules) is
 * then introduced around that escaped text. Links are restricted to
 * `http(s)://mailto:` schemes. The result is safe to inject with `{@html}`.
 *
 * This is intentionally a minimal subset – not a full CommonMark implementation –
 * which keeps it auditable and avoids pulling in a Markdown dependency.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline formatting over a single raw line. Escapes first, then adds safe tags. */
function inline(raw: string): string {
  let t = escapeHtml(raw);

  // Links: [label](url) – only safe schemes; otherwise render the label as text.
  t = t.replace(/\[([^\]]+)\]\(([^\s\)]+)\)/g, (_, label: string, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    if (!SAFE_URL.test(decoded)) return label;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" class="font-medium text-primary-700 underline underline-offset-2">${label}</a>`;
  });

  // Inline code, then bold, then italic (order matters so `**` isn't eaten by `*`).
  t = t.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-surface-sunken px-1 py-0.5 text-[0.85em]">$1</code>'
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*\s][^*]*[^*\s])\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/(?<!\*)_([^_\s][^_]*[^_\s])_(?!_)/g, '<em>$1</em>');

  return t;
}

/** Render a minimal, safe subset of Markdown to an HTML string. */
export function renderMarkdown(src?: string | null): string {
  if (!src) return '';

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      out.push(`<hr class="my-3 border-border" />`);
      i++;
      continue;
    }

    // Heading (rendered as a styled paragraph to avoid global heading margins).
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const cls =
        level <= 1
          ? 'mt-1 text-lg font-semibold'
          : level === 2
            ? 'mt-1 text-base font-semibold'
            : 'mt-1 text-sm font-semibold';
      out.push(`<p class="${cls}">${inline(heading[2])}</p>`);
      i++;
      continue;
    }

    // Blockquote.
    if (/^>\s/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        items.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote class="border-l-2 border-border pl-3 text-ink-muted">${items
          .map(inline)
          .join('<br>')}</blockquote>`
      );
      continue;
    }

    // Unordered list.
    if (/^[-*]\s/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      out.push(
        `<ul class="list-disc space-y-1 pl-5">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join('')}</ul>`
      );
      continue;
    }

    // Ordered list.
    if (/^\d+[.]\s/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+[.]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.]\s/, ''));
        i++;
      }
      out.push(
        `<ol class="list-decimal space-y-1 pl-5">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join('')}</ol>`
      );
      continue;
    }

    // Plain paragraph line.
    para.push(trimmed);
    i++;
  }

  flushPara();
  return out.join('\n');
}
