'use client';

import { getDesktopApi } from '@bga/utils/desktop-bridge';
import { Button, Text } from '@mantine/core';
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const DiagnosticsButton: FC = () => {
  const { t } = useTranslation();
  const [path, setPath] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(getDesktopApi() !== null);
  }, []);

  const handleSaveDiagnostics = (): void => {
    const api = getDesktopApi();
    if (api === null) {
      return;
    }
    void api.saveDiagnostics().then((result) => setPath(result.path));
  };

  if (!available) {
    return null;
  }

  return (
    <>
      <Button variant="subtle" size="xs" onClick={handleSaveDiagnostics}>
        {t('setup.diagnostics.save')}
      </Button>
      {path !== null && (
        <Text size="xs" c="dimmed">
          {t('setup.diagnostics.saved', { path })}
        </Text>
      )}
    </>
  );
};
