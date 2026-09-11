import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { LibraryCatchUpBar } from './LibraryCatchUpBar';

vi.mock('@bga/hooks/use-engine-readiness', () => ({
  useEngineReadiness: vi.fn(),
}));

const mockedReadiness = vi.mocked(useEngineReadiness);

describe('LibraryCatchUpBar', () => {
  beforeEach(() => {
    mockedReadiness.mockReturnValue({
      phase: 'ready',
      warmStage: null,
      libraryCatchUp: false,
    });
  });

  it('hides when catch-up is idle', () => {
    render(<LibraryCatchUpBar />, 'en');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows status while the library catch-up runs after Ask-ready', async () => {
    mockedReadiness.mockReturnValue({
      phase: 'ready',
      warmStage: null,
      libraryCatchUp: true,
    });
    render(<LibraryCatchUpBar />, 'en');
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
