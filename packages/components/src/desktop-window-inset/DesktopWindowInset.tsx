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

/**
 * Clears the macOS traffic lights when Electron uses titleBarStyle hiddenInset.
 * No-op in the browser and on Windows/Linux.
 */
export const DesktopWindowInset: FC<DesktopWindowInsetProps> = ({ children }) => {
  const inset = useSyncExternalStore(subscribe, getMacDesktopSnapshot, getServerSnapshot);

  if (!inset) {
    return children;
  }

  return (
    <Box pt={40} style={{ minHeight: '100vh' }}>
      {children}
    </Box>
  );
};
