import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SPLASH_ACTIVITY_CODES = [
  'checking_computer',
  'starting_assistant',
  'preparing_search',
  'reading_layout',
] as const;

export type SplashActivityCode = (typeof SPLASH_ACTIVITY_CODES)[number];

export interface StartupCopy {
  title: string;
  body: string;
}

export type StartupCopyVariant = 'firstRun' | 'returning';

export interface SplashHtmlOptions {
  copy: StartupCopy;
  dark: boolean;
  locale: 'en' | 'pl';
  /** macOS hiddenInset — leave room for traffic lights. */
  insetTitleBar?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function startupCopyFromCatalogue(
  catalogue: unknown,
  variant: StartupCopyVariant,
): StartupCopy | null {
  if (!isRecord(catalogue)) {
    return null;
  }
  const startup = catalogue.startup;
  if (!isRecord(startup)) {
    return null;
  }
  const bodyKey = variant === 'firstRun' ? 'loadingBodyFirstRun' : 'loadingBodyReturning';
  const title = startup.loadingTitle;
  const body = startup[bodyKey];
  if (typeof title !== 'string' || typeof body !== 'string') {
    return null;
  }
  if (title.length === 0 || body.length === 0) {
    return null;
  }
  return { title, body };
}

export function activityLineFromCatalogue(catalogue: unknown, code: string): string | null {
  if (!isRecord(catalogue)) {
    return null;
  }
  const activity = catalogue.activity;
  if (!isRecord(activity)) {
    return null;
  }
  const line = activity[code];
  if (typeof line !== 'string' || line.length === 0) {
    return null;
  }
  return line;
}

export function readStartupCopy(
  localesDir: string,
  locale: 'en' | 'pl',
  variant: StartupCopyVariant,
): StartupCopy {
  const raw = readFileSync(join(localesDir, locale, 'common.json'), 'utf8');
  const copy = startupCopyFromCatalogue(JSON.parse(raw) as unknown, variant);
  if (copy === null) {
    throw new Error(`Missing startup copy (${variant}) in ${locale} catalogue`);
  }
  return copy;
}

export function readActivityLine(localesDir: string, locale: 'en' | 'pl', code: string): string {
  const raw = readFileSync(join(localesDir, locale, 'common.json'), 'utf8');
  const line = activityLineFromCatalogue(JSON.parse(raw) as unknown, code);
  if (line === null) {
    throw new Error(`Missing activity.${code} in ${locale} catalogue`);
  }
  return line;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function splashSetActivityScript(title: string, body: string): string {
  return `(() => {
    const titleEl = document.getElementById('activity-title');
    const bodyEl = document.getElementById('activity-body');
    if (titleEl) titleEl.textContent = ${JSON.stringify(title)};
    if (bodyEl) bodyEl.textContent = ${JSON.stringify(body)};
    document.title = ${JSON.stringify(title)};
  })();`;
}

export interface SplashPageTarget {
  isDestroyed(): boolean;
  executeJavaScript(script: string): Promise<unknown>;
}

export interface ApplySplashActivityOptions {
  target: SplashPageTarget | null;
  localesDir: string;
  locale: 'en' | 'pl';
  code: SplashActivityCode;
  firstRun: boolean;
}

export function applySplashActivity(options: ApplySplashActivityOptions): void {
  const { target, localesDir, locale, code, firstRun } = options;
  if (target === null || target.isDestroyed()) {
    return;
  }
  const title = readActivityLine(localesDir, locale, code);
  const body = readStartupCopy(localesDir, locale, firstRun ? 'firstRun' : 'returning').body;
  void target.executeJavaScript(splashSetActivityScript(title, body)).catch(() => {
    /* splash may already have navigated away */
  });
}

export function buildSplashHtml(options: SplashHtmlOptions): string {
  const title = escapeHtml(options.copy.title);
  const body = escapeHtml(options.copy.body);
  const darkClass = options.dark ? ' class="dark"' : '';
  const insetPad = options.insetTitleBar === true ? ' padding-top: 2.5rem;' : '';
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
      justify-content: center;${insetPad}
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8f9fa;
      color: #1a1b1e;
    }
    body.dark { background: #1a1b1e; color: #f8f9fa; }
    main { max-width: 28rem; padding: 2rem; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 1rem 0 0.5rem; }
    p { margin: 0; line-height: 1.45; opacity: 0.82; }
    .mark { width: 5.5rem; height: 5.5rem; margin: 0 auto; }
    .ring { fill: none; stroke-width: 5; stroke-linecap: round; }
    .track { stroke: currentColor; opacity: 0.18; }
    .inner {
      stroke: currentColor;
      opacity: 0.45;
      stroke-dasharray: 28 135;
      transform-origin: 44px 44px;
      animation: orbit 1.8s linear infinite;
    }
    .outer {
      stroke: currentColor;
      stroke-dasharray: 36 90;
      transform-origin: 44px 44px;
      animation: orbit 0.85s linear infinite;
    }
    @keyframes orbit { to { transform: rotate(360deg); } }
  </style>
</head>
<body${darkClass}>
  <main role="status" aria-busy="true" aria-live="polite">
    <svg class="mark" viewBox="0 0 88 88" aria-hidden="true">
      <circle class="ring track" cx="44" cy="44" r="36"></circle>
      <circle class="ring inner" cx="44" cy="44" r="26"></circle>
      <circle class="ring outer" cx="44" cy="44" r="36"></circle>
    </svg>
    <h1 id="activity-title">${title}</h1>
    <p id="activity-body">${body}</p>
  </main>
</body>
</html>`;
}

export function splashDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
