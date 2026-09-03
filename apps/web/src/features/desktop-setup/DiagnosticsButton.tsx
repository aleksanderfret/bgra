'use client';

import { Button, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDesktopApi } from '@/lib/desktop-bridge';

export function DiagnosticsButton() {
  const { t } = useTranslation();
  const [path, setPath] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(getDesktopApi() !== null);
  }, []);

  if (!available) {
    return null;
  }

  return (
    <>
      <Button
        variant="subtle"
        size="xs"
        onClick={() => {
          const api = getDesktopApi();
          if (api === null) {
            return;
          }
          void api.saveDiagnostics().then((result) => setPath(result.path));
        }}
      >
        {t('setup.diagnostics.save')}
      </Button>
      {path !== null && (
        <Text size="xs" c="dimmed">
          {t('setup.diagnostics.saved', { path })}
        </Text>
      )}
    </>
  );
}
