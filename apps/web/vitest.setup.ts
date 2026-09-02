import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Testing Library only auto-registers its cleanup when Vitest runs with
 * `globals: true`. We import test helpers explicitly, so the teardown has to
 * be wired by hand — otherwise each render stacks on top of the previous one
 * and queries start matching elements from earlier tests.
 */
afterEach(cleanup);

/**
 * jsdom implements neither `matchMedia` nor `ResizeObserver`, and several
 * Mantine components call both while measuring themselves. Without these stubs
 * every render that touches a responsive component throws.
 */

const { getComputedStyle } = window;
window.getComputedStyle = (element) => getComputedStyle(element);
window.HTMLElement.prototype.scrollIntoView = () => {};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverStub;
