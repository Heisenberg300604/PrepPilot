import { describe, expect, it } from 'vitest';
import type { MockAttempt, MockTest } from '@/lib/types';
import { defaultsFor, detectUrl, isSavedAlready, mockSummary, parseUrls, platformOf, scoreFromCounts } from './resourceUtils';

const attempt = (score: number, attemptedOn: string, maxScore = 300): MockAttempt => ({ id: `${score}${attemptedOn}`, mockTestId: 't', score, maxScore, correct: null, wrong: null, skipped: null, timeMinutes: null, reflection: null, attemptedOn, createdAt: `${attemptedOn}T10:00:00Z` });
const mock = (over: Partial<MockTest> = {}): MockTest => ({ id: 't', examId: 'e', title: 'Mock', url: 'https://www.prephub.in/afcat/mock-test-1', testType: 'FULL', maxScore: 300, durationMinutes: 120, marksCorrect: 3, marksWrong: -1, displayOrder: 0, createdAt: '2026-10-01T00:00:00Z', attempts: [], ...over });

describe('parseUrls', () => {
  it('splits pasted text, adds https to bare domains, dedupes, and drops unsafe schemes', () => {
    const text = 'https://www.prephub.in/afcat/mock-test-1\nprephub.in/afcat/mock-test-1/  testbook.com/afcat, javascript:alert(1) mailto:a@b.com nonsense';
    expect(parseUrls(text)).toEqual(['https://www.prephub.in/afcat/mock-test-1', 'https://testbook.com/afcat']);
  });
});

describe('detectUrl', () => {
  it('recognises mock tests on test sites, official pages, notes and PYQs', () => {
    expect(detectUrl('https://www.prephub.in/afcat/mock-test-4')).toMatchObject({ kind: 'MOCK', testType: 'FULL', title: 'Mock test 4' });
    expect(detectUrl('https://testbook.com/afcat/sectional/verbal')).toMatchObject({ kind: 'MOCK', testType: 'SECTIONAL' });
    expect(detectUrl('https://www.prephub.in/afcat/pyq/2025-shift-1')).toMatchObject({ kind: 'MOCK', testType: 'PYQ' });
    expect(detectUrl('https://afcat.cdac.in/AFCAT/')).toMatchObject({ kind: 'LINK', category: 'OFFICIAL', title: 'AFCAT' });
    expect(detectUrl('https://drive.google.com/drive/folders/1AbC')).toMatchObject({ kind: 'LINK', category: 'NOTES' });
    expect(detectUrl('https://example.com/afcat-syllabus.pdf')).toMatchObject({ kind: 'LINK', category: 'SYLLABUS', title: 'Afcat syllabus' });
    // a "test" path on a random site is just a link
    expect(detectUrl('https://myblog.com/test-tips')).toMatchObject({ kind: 'LINK' });
    // numeric ids make bad titles
    expect(detectUrl('https://www.prephub.in/12345').title).toBe('PrepHub');
  });

  it('names platforms', () => {
    expect(platformOf('https://www.prephub.in/x')).toBe('PrepHub');
    expect(platformOf('https://careerindianairforce.cdac.in/')).toBe('CDAC');
    expect(platformOf('https://somesite.org')).toBe('Somesite');
  });
});

describe('isSavedAlready', () => {
  it('ignores scheme, www and trailing slashes', () => {
    const existing = { links: [{ url: 'https://afcat.cdac.in/AFCAT/' }], tests: [mock()] } as any;
    expect(isSavedAlready('afcat.cdac.in/afcat', existing)).toBe(true);
    expect(isSavedAlready('http://prephub.in/afcat/mock-test-1/', existing)).toBe(true);
    expect(isSavedAlready('https://prephub.in/afcat/mock-test-2', existing)).toBe(false);
  });
});

describe('scores', () => {
  it('calculates a score from counts only when a marking scheme exists', () => {
    expect(scoreFromCounts(mock(), '70', '18')).toBe(192);
    expect(scoreFromCounts(mock(), '70', '')).toBe(210);
    expect(scoreFromCounts(mock({ marksWrong: -0.33 }), '10', '3')).toBe(29.01);
    expect(scoreFromCounts(mock({ marksCorrect: null, marksWrong: null }), '70', '18')).toBeNull();
    expect(scoreFromCounts(mock(), '', '18')).toBeNull();
  });

  it('summarises full papers only, with trend over the last three', () => {
    const s = mockSummary([
      mock({ id: 'a', attempts: [attempt(168, '2026-10-01'), attempt(192, '2026-10-10')] }),
      mock({ id: 'b', attempts: [attempt(214, '2026-10-20')] }),
      mock({ id: 'c', testType: 'SECTIONAL', maxScore: 90, attempts: [attempt(80, '2026-10-25', 90)] }),
      mock({ id: 'd' }),
    ]);
    expect(s).toMatchObject({ total: 4, attempted: 3, trendSpan: 3, trend: 46 });
    expect(s.last?.score).toBe(214);
    expect(s.best?.score).toBe(214);
    expect(Math.round(s.avg!)).toBe(191);
    expect(mockSummary([]).trend).toBeNull();
  });

  it('copies new-test defaults from the latest test of the same type', () => {
    const tests = [mock({ maxScore: 300 }), mock({ testType: 'SECTIONAL', maxScore: 90, durationMinutes: 25 })];
    expect(defaultsFor(tests, 'SECTIONAL')).toMatchObject({ maxScore: 90, durationMinutes: 25 });
    expect(defaultsFor(tests, 'PYQ')).toMatchObject({ maxScore: 300, marksCorrect: 3 });
    expect(defaultsFor([], 'FULL')).toEqual({ maxScore: 100, durationMinutes: null, marksCorrect: null, marksWrong: null });
  });
});
