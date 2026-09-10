'use client';

import type { ActivityView } from '@bga/utils/activity-progress';
import { Stack, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './ActivityProgress.module.css';

export interface ActivityProgressProps {
  view: ActivityView;
  layout: 'page' | 'inline';
}

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ActivityProgress: FC<ActivityProgressProps> = ({ view, layout }) => {
  const { t } = useTranslation();
  const code = view.activity;
  const label =
    code === null
      ? t('activity.unknown')
      : t(`activity.${code}`, { defaultValue: t('activity.unknown') });
  const percent = view.percent;
  const determinate = percent !== null;
  const displayPercent = percent === null ? null : Math.round(percent);
  const dashOffset =
    percent === null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - percent / 100);
  const shellClass = layout === 'page' ? classes.page : classes.inline;

  const mark = (
    <svg className={classes.mark} viewBox="0 0 88 88" aria-hidden="true">
      <circle className={`${classes.ring} ${classes.track}`} cx="44" cy="44" r={RING_RADIUS} />
      <circle className={`${classes.ring} ${classes.inner}`} cx="44" cy="44" r="26" />
      {determinate ? (
        <circle
          className={`${classes.ring} ${classes.outerDeterminate}`}
          cx="44"
          cy="44"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      ) : (
        <circle
          className={`${classes.ring} ${classes.outerSpin}`}
          cx="44"
          cy="44"
          r={RING_RADIUS}
        />
      )}
    </svg>
  );

  const copy = (
    <Stack gap={4} className={classes.label} key={code ?? 'unknown'}>
      <Text>{label}</Text>
      {displayPercent !== null ? (
        <Text size="sm" c="dimmed">
          {t('activity.detail', { percent: displayPercent })}
        </Text>
      ) : null}
    </Stack>
  );

  if (percent !== null) {
    return (
      <div
        className={shellClass}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={label}
      >
        {mark}
        {copy}
      </div>
    );
  }

  return (
    <div className={shellClass} role="status" aria-busy="true" aria-live="polite">
      {mark}
      {copy}
    </div>
  );
};
