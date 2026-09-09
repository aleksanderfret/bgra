export interface UninstallSelection {
  removeData: boolean;
  removeApplication: boolean;
  removeLlmModels: boolean;
  removeOllama: boolean;
}

export function defaultUninstallSelection(): UninstallSelection {
  return {
    removeData: false,
    removeApplication: false,
    removeLlmModels: false,
    removeOllama: false,
  };
}

export function parseUninstallSelection(value: unknown): UninstallSelection | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = ['removeData', 'removeApplication', 'removeLlmModels', 'removeOllama'] as const;
  for (const key of keys) {
    if (typeof record[key] !== 'boolean') {
      return null;
    }
  }
  return {
    removeData: record.removeData as boolean,
    removeApplication: record.removeApplication as boolean,
    removeLlmModels: record.removeLlmModels as boolean,
    removeOllama: record.removeOllama as boolean,
  };
}
