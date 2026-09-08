import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  activityLineFromCatalogue,
  applySplashActivity,
  buildSplashHtml,
  readActivityLine,
  readStartupCopy,
  splashSetActivityScript,
  startupCopyFromCatalogue,
} from './splash';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../web/src/i18n/locales');

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

describe('activityLineFromCatalogue', () => {
  it('reads an activity line from the catalogue', () => {
    expect(
      activityLineFromCatalogue(
        { activity: { starting_assistant: 'Starting the assistant…' } },
        'starting_assistant',
      ),
    ).toBe('Starting the assistant…');
  });
});

describe('readActivityLine', () => {
  it('matches the web English and Polish catalogues', () => {
    const enWeb = JSON.parse(readFileSync(join(localesDir, 'en', 'common.json'), 'utf8')) as {
      activity: { starting_assistant: string };
    };
    const plWeb = JSON.parse(readFileSync(join(localesDir, 'pl', 'common.json'), 'utf8')) as {
      activity: { starting_assistant: string };
    };
    expect(readActivityLine(localesDir, 'en', 'starting_assistant')).toBe(
      enWeb.activity.starting_assistant,
    );
    expect(readActivityLine(localesDir, 'pl', 'starting_assistant')).toBe(
      plWeb.activity.starting_assistant,
    );
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
    expect(html).toContain('id="activity-title"');
    expect(html).toContain('id="activity-body"');
    expect(html).toContain('class="dark"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('@keyframes orbit');
  });
});

describe('splashSetActivityScript', () => {
  it('escapes quotes so executeJavaScript cannot break out', () => {
    const script = splashSetActivityScript('Say "go"', "It's ready");
    expect(script).toContain('"Say \\"go\\""');
    expect(script).toContain('"It\'s ready"');
  });
});

describe('applySplashActivity', () => {
  it('writes catalogue lines onto the splash page', async () => {
    const scripts: string[] = [];
    applySplashActivity({
      target: {
        isDestroyed: () => false,
        executeJavaScript: async (script) => {
          scripts.push(script);
        },
      },
      localesDir,
      locale: 'en',
      code: 'starting_assistant',
    });
    await Promise.resolve();
    const title = readActivityLine(localesDir, 'en', 'starting_assistant');
    expect(scripts[0]).toContain(JSON.stringify(title));
  });

  it('does nothing when the page is gone', () => {
    let called = false;
    applySplashActivity({
      target: {
        isDestroyed: () => true,
        executeJavaScript: async () => {
          called = true;
        },
      },
      localesDir,
      locale: 'en',
      code: 'starting_assistant',
    });
    expect(called).toBe(false);
  });
});
