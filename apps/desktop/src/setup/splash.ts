import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StartupCopy {
  title: string;
  body: string;
}

export interface SplashHtmlOptions {
  copy: StartupCopy;
  dark: boolean;
  locale: 'en' | 'pl';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function startupCopyFromCatalogue(catalogue: unknown): StartupCopy | null {
  if (!isRecord(catalogue)) {
    return null;
  }
  const startup = catalogue.startup;
  if (!isRecord(startup)) {
    return null;
  }
  if (typeof startup.loadingTitle !== 'string' || typeof startup.loadingBody !== 'string') {
    return null;
  }
  if (startup.loadingTitle.length === 0 || startup.loadingBody.length === 0) {
    return null;
  }
  return { title: startup.loadingTitle, body: startup.loadingBody };
}

export function readStartupCopy(localesDir: string, locale: 'en' | 'pl'): StartupCopy {
  const raw = readFileSync(join(localesDir, locale, 'common.json'), 'utf8');
  const copy = startupCopyFromCatalogue(JSON.parse(raw) as unknown);
  if (copy === null) {
    throw new Error(`Missing startup copy in ${locale} catalogue`);
  }
  return copy;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildSplashHtml(options: SplashHtmlOptions): string {
  const title = escapeHtml(options.copy.title);
  const body = escapeHtml(options.copy.body);
  const darkClass = options.dark ? ' class="dark"' : '';
  return `<!DOCTYPE html>
<html lang="${options.locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    html, body { margin: 0; height: 100%; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8f9fa;
      color: #1a1b1e;
    }
    body.dark { background: #1a1b1e; color: #f8f9fa; }
    main { max-width: 28rem; padding: 2rem; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 1rem 0 0.5rem; }
    p { margin: 0; line-height: 1.45; opacity: 0.82; }
    .dot {
      width: 2.25rem;
      height: 2.25rem;
      margin: 0 auto;
      border-radius: 50%;
      border: 3px solid currentColor;
      border-right-color: transparent;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body${darkClass}>
  <main aria-busy="true" aria-live="polite">
    <div class="dot" aria-hidden="true"></div>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`;
}

export function splashDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
