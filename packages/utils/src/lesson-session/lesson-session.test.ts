import type { LessonSession } from '@bga/api-contract';
import { describe, expect, it } from 'vitest';
import { isLessonActiveResponse, isLessonSession } from './lesson-session';

const validSession = (): LessonSession => ({
  sessionId: 'sess-1',
  gameId: 'azul',
  expansionIds: [],
  syllabus: [{ unitId: 'u1', title: 'Goal', sectionRefs: ['s1'] }],
  unitIndex: 0,
  status: 'active',
  updatedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-02T00:00:00Z',
  turns: [
    {
      id: 't1',
      kind: 'unit',
      unitId: 'u1',
      question: null,
      text: 'Welcome.',
      sources: [],
      groundedness: 'grounded',
    },
  ],
});

describe('isLessonSession', () => {
  it('accepts a well-formed session', () => {
    expect(isLessonSession(validSession())).toBe(true);
  });

  it('rejects missing sessionId', () => {
    const { sessionId: _ignored, ...rest } = validSession();
    expect(isLessonSession(rest)).toBe(false);
  });
});

describe('isLessonActiveResponse', () => {
  it('accepts null session', () => {
    expect(isLessonActiveResponse({ session: null })).toBe(true);
  });

  it('accepts a session payload', () => {
    expect(isLessonActiveResponse({ session: validSession() })).toBe(true);
  });

  it('rejects a bare session', () => {
    expect(isLessonActiveResponse(validSession())).toBe(false);
  });
});
