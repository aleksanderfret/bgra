'use client';

import { getDesktopApi } from '@bga/utils/desktop-bridge';
import { Box } from '@mantine/core';
import { type FC, type ReactNode, useSyncExternalStore } from 'react';

export interface DesktopWindowInsetProps {
  children: ReactNode;
}

const subscribe = (): (() => void) => () => undefined;
const getMacDesktopSnapshot = (): boolean => getDesktopApi()?.platform === 'darwin';
const getServerSnapshot = (): boolean => false;

/** Room for macOS traffic lights with hiddenInset — keep compact to avoid scroll. */
const MAC_TITLE_INSET_PX = 28;

/**
 * Clears the macOS traffic lights when Electron uses titleBarStyle hiddenInset.
 * No-op in the browser and on Windows/Linux.
 *
 * Uses border-box + minHeight 100dvh so padding is inside the viewport height
 * and does not force a document scrollbar by itself.
 */
export const DesktopWindowInset: FC<DesktopWindowInsetProps> = ({ children }) => {
  const inset = useSyncExternalStore(subscribe, getMacDesktopSnapshot, getServerSnapshot);

  if (!inset) {
    return children;
  }

  return (
    <Box
      style={{
        boxSizing: 'border-box',
        minHeight: '100dvh',
        paddingTop: MAC_TITLE_INSET_PX,
      }}
    >
      {children}
    </Box>
  );
};
