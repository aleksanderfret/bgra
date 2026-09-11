'use client';

import type { GameCatalogueItem } from '@bga/api-contract';
import { useGameCatalogue } from '@bga/hooks/use-game-catalogue';
import {
  buildPickerSections,
  type GamePickerLocale,
  type GamePickerRow,
} from '@bga/utils/game-catalogue';
import { loadRecentGameIds, recordRecentGame } from '@bga/utils/recent-games';
import {
  CloseButton,
  Combobox,
  Group,
  InputBase,
  ScrollArea,
  useVirtualizedCombobox,
} from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type ChangeEvent,
  type FC,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

const ROW_HEIGHT = 36;
const LIST_WIDTH = 320;
const LIST_HEIGHT = 280;

export interface GamePickerProps {
  value: string | null;
  onChange: (gameId: string | null) => void;
  locale: GamePickerLocale;
  /** When omitted, the shared catalogue hook loads once for the tree. */
  games?: GameCatalogueItem[] | null;
  basesOnly?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  'aria-describedby'?: string;
}

export const GamePicker: FC<GamePickerProps> = ({
  value,
  onChange,
  locale,
  games: gamesProp,
  basesOnly = false,
  clearable = false,
  disabled = false,
  label,
  description,
  placeholder,
  'aria-describedby': ariaDescribedBy,
}) => {
  const { t } = useTranslation();
  const labelId = useId();
  const catalogue = useGameCatalogue();
  const games = gamesProp !== undefined ? gamesProp : catalogue.games;
  const [query, setQuery] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1);
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    typeof localStorage === 'undefined' ? [] : loadRecentGameIds(localStorage),
  );
  const listRef = useRef<HTMLDivElement>(null);

  const rows: GamePickerRow[] = useMemo(() => {
    if (games === null) {
      return [];
    }
    return buildPickerSections({
      games,
      recentIds,
      query,
      locale,
      basesOnly,
    });
  }, [games, recentIds, query, locale, basesOnly]);

  const selectedTitle = games?.find((game) => game.gameId === value)?.title ?? null;

  const optionIdAt = (index: number): string | null => {
    const row = rows[index];
    if (row === undefined || row.type === 'header') {
      return null;
    }
    return `game-picker-option-${row.game.gameId}`;
  };

  const isOptionDisabled = (index: number): boolean => {
    const row = rows[index];
    return row === undefined || row.type === 'header';
  };

  const handleOptionSubmitByIndex = (index: number): void => {
    const row = rows[index];
    if (row === undefined || row.type === 'header') {
      return;
    }
    onChange(row.game.gameId);
    if (typeof localStorage !== 'undefined') {
      recordRecentGame(row.game.gameId, localStorage);
      setRecentIds(loadRecentGameIds(localStorage));
    }
    setQuery('');
    combobox.closeDropdown();
  };

  const combobox = useVirtualizedCombobox({
    totalOptionsCount: rows.length,
    getOptionId: optionIdAt,
    isOptionDisabled,
    selectedOptionIndex,
    setSelectedOptionIndex,
    activeOptionIndex: selectedOptionIndex >= 0 ? selectedOptionIndex : undefined,
    onSelectedOptionSubmit: handleOptionSubmitByIndex,
    onDropdownClose: () => {
      setSelectedOptionIndex(-1);
      setQuery('');
    },
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: LIST_WIDTH, height: LIST_HEIGHT },
    observeElementRect: (_instance, callback) => {
      const element = listRef.current;
      if (element === null) {
        callback({ width: LIST_WIDTH, height: LIST_HEIGHT });
        return;
      }
      const report = (): void => {
        const rect = element.getBoundingClientRect();
        callback({
          width: rect.width > 0 ? rect.width : LIST_WIDTH,
          height: rect.height > 0 ? rect.height : LIST_HEIGHT,
        });
      };
      report();
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(report);
      observer?.observe(element);
      return () => {
        observer?.disconnect();
      };
    },
  });

  useEffect(() => {
    if (selectedOptionIndex < 0 || selectedOptionIndex >= rows.length) {
      return;
    }
    virtualizer.scrollToIndex(selectedOptionIndex, { align: 'auto' });
  }, [selectedOptionIndex, rows.length, virtualizer]);

  const headerLabel = (id: 'recent' | 'all' | 'results'): string => {
    if (id === 'recent') {
      return t('gamePicker.recent');
    }
    if (id === 'all') {
      return t('gamePicker.all');
    }
    return t('gamePicker.results');
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setQuery(event.currentTarget.value);
    setSelectedOptionIndex(-1);
    combobox.openDropdown();
  };

  const handleBlur = (): void => {
    combobox.closeDropdown();
    setQuery('');
  };

  const handleClick = (): void => {
    combobox.openDropdown();
  };

  const handleFocus = (): void => {
    combobox.openDropdown();
  };

  const handleClear = (): void => {
    onChange(null);
    setQuery('');
  };

  const handleOptionClick = (gameId: string): void => {
    onChange(gameId);
    if (typeof localStorage !== 'undefined') {
      recordRecentGame(gameId, localStorage);
      setRecentIds(loadRecentGameIds(localStorage));
    }
    setQuery('');
    combobox.closeDropdown();
  };

  const loading = games === null;
  const empty = games !== null && games.length === 0;
  const inputDisabled = disabled || loading || empty;
  const displayValue = combobox.dropdownOpened ? query : (selectedTitle ?? '');
  const showClear = clearable && value !== null && !inputDisabled;

  let inputPlaceholder = placeholder ?? t('gamePicker.placeholder');
  if (loading) {
    inputPlaceholder = t('gamePicker.loading');
  } else if (empty) {
    inputPlaceholder = t('gamePicker.empty');
  }

  return (
    <Combobox store={combobox} disabled={inputDisabled}>
      <Combobox.Target withExpandedAttribute>
        <InputBase
          label={label}
          description={description}
          id={labelId}
          aria-describedby={ariaDescribedBy}
          rightSection={
            <Group gap={4} wrap="nowrap">
              {showClear ? (
                <CloseButton
                  size="sm"
                  aria-label={t('gamePicker.clear')}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={handleClear}
                />
              ) : null}
              <Combobox.Chevron />
            </Group>
          }
          rightSectionPointerEvents={showClear ? 'all' : 'none'}
          value={displayValue}
          onChange={handleSearchChange}
          onClick={handleClick}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={inputPlaceholder}
          disabled={inputDisabled}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {rows.length === 0 ? (
            <Combobox.Empty>{t('gamePicker.noResults')}</Combobox.Empty>
          ) : (
            <ScrollArea.Autosize mah={LIST_HEIGHT} type="scroll" viewportRef={listRef}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (row === undefined) {
                    return null;
                  }
                  const rowStyle = {
                    position: 'absolute' as const,
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  };
                  if (row.type === 'header') {
                    return (
                      <Combobox.Group
                        key={`header-${row.id}-${virtualRow.index}`}
                        label={headerLabel(row.id)}
                        style={rowStyle}
                      />
                    );
                  }
                  return (
                    <Combobox.Option
                      key={row.game.gameId}
                      id={optionIdAt(virtualRow.index) ?? undefined}
                      value={row.game.gameId}
                      active={virtualRow.index === selectedOptionIndex}
                      onClick={() => {
                        handleOptionClick(row.game.gameId);
                      }}
                      style={rowStyle}
                    >
                      {row.game.title}
                    </Combobox.Option>
                  );
                })}
              </div>
            </ScrollArea.Autosize>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};
