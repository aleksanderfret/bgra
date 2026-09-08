export type DesktopLaunchAction =
  | { type: 'startBackend'; skipRetrievalWarm: boolean }
  | { type: 'loadAppPage' }
  | { type: 'ensureRuntime' };

export interface DesktopLaunchOptions {
  returningPlayer: boolean;
}

export const desktopLaunchActions = (
  options: DesktopLaunchOptions,
): readonly DesktopLaunchAction[] => {
  const actions: DesktopLaunchAction[] = [
    { type: 'startBackend', skipRetrievalWarm: !options.returningPlayer },
    { type: 'loadAppPage' },
  ];
  if (options.returningPlayer) {
    actions.push({ type: 'ensureRuntime' });
  }
  return actions;
};
