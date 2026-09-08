import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSplashHtml, readStartupCopy, startupCopyFromCatalogue } from './splash';

const localesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web/src/i18n/locales',
);

describe('startupCopyFromCatalogue', () => {
  it('reads title and body from the catalogue', () => {
    expect(
      startupCopyFromCatalogue({
        startup: { loadingTitle: 'Getting ready…', loadingBody: 'Please wait.' },
      }),
    ).toEqual({ title: 'Getting ready…', body: 'Please wait.' });
  });

  it('rejects a blank title', () => {
    expect(
      startupCopyFromCatalogue({
        startup: { loadingTitle: '', loadingBody: 'Please wait.' },
      }),
    ).toBeNull();
  });
});

describe('readStartupCopy', () => {
  it('matches the web English and Polish catalogues', () => {
    const enWeb = JSON.parse(readFileSync(join(localesDir, 'en', 'common.json'), 'utf8')) as {
      startup: { loadingTitle: string; loadingBody: string };
    };
    const plWeb = JSON.parse(readFileSync(join(localesDir, 'pl', 'common.json'), 'utf8')) as {
      startup: { loadingTitle: string; loadingBody: string };
    };
    expect(readStartupCopy(localesDir, 'en')).toEqual({
      title: enWeb.startup.loadingTitle,
      body: enWeb.startup.loadingBody,
    });
    expect(readStartupCopy(localesDir, 'pl')).toEqual({
      title: plWeb.startup.loadingTitle,
      body: plWeb.startup.loadingBody,
    });
  });
});

describe('buildSplashHtml', () => {
  it('escapes copy and marks the page as busy', () => {
    const html = buildSplashHtml({
      copy: { title: 'Wait <now>', body: 'A & B' },
      dark: true,
      locale: 'en',
    });
    expect(html).toContain('Wait &lt;now&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('Wait <now>');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="dark"');
    expect(html).toContain('lang="en"');
  });
});
