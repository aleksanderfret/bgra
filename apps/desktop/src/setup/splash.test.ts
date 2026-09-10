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
  it('reads first-run and returning bodies from the catalogue', () => {
    const catalogue = {
      startup: {
        loadingTitle: 'Getting ready…',
        loadingBodyFirstRun: 'First open.',
        loadingBodyReturning: 'Starting the app…',
      },
    };
    expect(startupCopyFromCatalogue(catalogue, 'firstRun')).toEqual({
      title: 'Getting ready…',
      body: 'First open.',
    });
    expect(startupCopyFromCatalogue(catalogue, 'returning')).toEqual({
      title: 'Getting ready…',
      body: 'Starting the app…',
    });
  });

  it('rejects a blank title', () => {
    expect(
      startupCopyFromCatalogue(
        {
          startup: {
            loadingTitle: '',
            loadingBodyFirstRun: 'Please wait.',
            loadingBodyReturning: 'Starting…',
          },
        },
        'firstRun',
      ),
    ).toBeNull();
  });
});

describe('readStartupCopy', () => {
  it('matches the web English and Polish catalogues', () => {
    const enWeb = JSON.parse(readFileSync(join(localesDir, 'en', 'common.json'), 'utf8')) as {
      startup: {
        loadingTitle: string;
        loadingBodyFirstRun: string;
        loadingBodyReturning: string;
      };
    };
    const plWeb = JSON.parse(readFileSync(join(localesDir, 'pl', 'common.json'), 'utf8')) as {
      startup: {
        loadingTitle: string;
        loadingBodyFirstRun: string;
        loadingBodyReturning: string;
      };
    };
    expect(readStartupCopy(localesDir, 'en', 'firstRun')).toEqual({
      title: enWeb.startup.loadingTitle,
      body: enWeb.startup.loadingBodyFirstRun,
    });
    expect(readStartupCopy(localesDir, 'en', 'returning')).toEqual({
      title: enWeb.startup.loadingTitle,
      body: enWeb.startup.loadingBodyReturning,
    });
    expect(readStartupCopy(localesDir, 'pl', 'returning').body).toBe(
      plWeb.startup.loadingBodyReturning,
    );
    expect(enWeb.startup.loadingBodyReturning.toLowerCase()).not.toContain('first');
    expect(plWeb.startup.loadingBodyReturning.toLowerCase()).not.toContain('pierwsz');
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

  it('adds top padding when the macOS title bar is inset', () => {
    const html = buildSplashHtml({
      copy: { title: 'Ready', body: 'Wait' },
      dark: false,
      locale: 'pl',
      insetTitleBar: true,
    });
    expect(html).toContain('padding-top: 2.5rem');
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
      firstRun: false,
    });
    await Promise.resolve();
    const title = readActivityLine(localesDir, 'en', 'starting_assistant');
    const body = readStartupCopy(localesDir, 'en', 'returning').body;
    expect(scripts[0]).toContain(JSON.stringify(title));
    expect(scripts[0]).toContain(JSON.stringify(body));
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
      firstRun: true,
    });
    expect(called).toBe(false);
  });
});
