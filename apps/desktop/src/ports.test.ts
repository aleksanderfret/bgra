import { describe, expect, it } from 'vitest';
import { findFreePort } from './ports';

describe('findFreePort', () => {
  it('returns a port in the requested range', async () => {
    const port = await findFreePort(37_000, 37_050);
    expect(port).toBeGreaterThanOrEqual(37_000);
    expect(port).toBeLessThanOrEqual(37_050);
  });
});
