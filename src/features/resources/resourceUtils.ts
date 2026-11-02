import type { ExamResources, LinkCategory, MockAttempt, MockTest, MockTestType } from '@/lib/types';

export const CATEGORY_LABEL: Record<LinkCategory, string> = { OFFICIAL: 'Official', SYLLABUS: 'Syllabus', PYQ: 'PYQs', NOTES: 'Notes', OTHER: 'Other' };
export const CATEGORY_ORDER: LinkCategory[] = ['OFFICIAL', 'SYLLABUS', 'PYQ', 'NOTES', 'OTHER'];
export const MOCK_TYPE_LABEL: Record<MockTestType, string> = { FULL: 'Full mock', SECTIONAL: 'Sectional', PYQ: 'PYQ paper' };

// ---- URLs ----

export const normaliseUrl = (url: string) =>
  url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/#?]+$/, '')
    .toLowerCase();

export function isSavedAlready(url: string, existing?: ExamResources) {
  if (!existing) return false;
  const n = normaliseUrl(url);
  return existing.links.some((l) => normaliseUrl(l.url) === n) || existing.tests.some((t) => normaliseUrl(t.url) === n);
}

/** Splits pasted text into unique, valid http(s) URLs (bare domains get https://). */
export function parseUrls(text: string): string[] {
  const out = new Map<string, string>();
  for (const raw of text.split(/[\s,]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const withScheme = /^https?:\/\//i.test(s) ? s : /^[a-z]+:/i.test(s) ? null : `https://${s}`;
    if (!withScheme) continue; // javascript:, mailto: etc.
    try {
      const u = new URL(withScheme);
      if (u.hostname.includes('.') && !out.has(normaliseUrl(u.href))) out.set(normaliseUrl(u.href), u.href);
    } catch {
      /* not a URL */
    }
  }
  return [...out.values()];
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const PLATFORM_NAMES: Record<string, string> = { prephub: 'PrepHub', testbook: 'Testbook', adda247: 'Adda247', oliveboard: 'Oliveboard', cdac: 'CDAC', drive: 'Google Drive', docs: 'Google Docs', youtube: 'YouTube', embibe: 'Embibe', unacademy: 'Unacademy' };
export function platformOf(url: string): string {
  const parts = domainOf(url).split('.');
  const key = parts.find((p) => PLATFORM_NAMES[p]) ?? parts[0];
  return PLATFORM_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const TEST_SITES = ['prephub', 'testbook', 'oliveboard', 'adda247', 'gradeup', 'embibe', 'unacademy', 'mockers'];
/** Best-effort guess at what a pasted URL is, so the add dialog arrives pre-filled. The user can correct it. */
export function detectUrl(url: string): { kind: 'LINK' | 'MOCK'; title: string; category: LinkCategory; testType: MockTestType } {
  const lower = url.toLowerCase();
  const domain = domainOf(url);
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep '' */
  }
  const onTestSite = TEST_SITES.some((s) => domain.includes(s));
  const isPyq = /pyq|previous|past-paper|question-paper/.test(lower);
  const looksLikeTest = onTestSite && (/mock|test|quiz|sectional|practice/.test(path.toLowerCase()) || (isPyq && /\d{4}/.test(path)));
  const category: LinkCategory = /\.gov\.in$|\.nic\.in$|cdac\.in$/.test(domain)
    ? 'OFFICIAL'
    : /syllabus|pattern/.test(lower)
      ? 'SYLLABUS'
      : isPyq
        ? 'PYQ'
        : /drive\.google|docs\.google|notion\./.test(domain)
          ? 'NOTES'
          : 'OTHER';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  let words = '';
  try {
    words = decodeURIComponent(last);
  } catch {
    words = last;
  }
  words = words.replace(/\.(pdf|html?|aspx?|php)$/i, '').replace(/[-_]+/g, ' ').trim();
  // ids and hashes make poor titles; fall back to the site name
  const title = words && !/^[\d\s]+$/.test(words) && words.length <= 80 ? words.charAt(0).toUpperCase() + words.slice(1) : platformOf(url);
  return { kind: looksLikeTest ? 'MOCK' : 'LINK', title, category, testType: /sectional/.test(lower) ? 'SECTIONAL' : isPyq ? 'PYQ' : 'FULL' };
}

// ---- Scores ----

export const pct = (a: Pick<MockAttempt, 'score' | 'maxScore'>) => (a.maxScore ? (a.score / a.maxScore) * 100 : 0);
export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Score from counts when the test has a marking scheme; null when it can't be worked out. */
export function scoreFromCounts(test: Pick<MockTest, 'marksCorrect' | 'marksWrong'>, correct: string, wrong: string): number | null {
  if (test.marksCorrect == null || correct.trim() === '') return null;
  const c = Number(correct);
  const w = wrong.trim() === '' ? 0 : Number(wrong);
  if (!Number.isFinite(c) || !Number.isFinite(w)) return null;
  return Math.round((c * test.marksCorrect + w * (test.marksWrong ?? 0)) * 100) / 100;
}

/** Defaults for a new test, copied from the most recent test of the same type in this exam. */
export function defaultsFor(tests: MockTest[], testType: MockTestType): Pick<MockTest, 'maxScore' | 'durationMinutes' | 'marksCorrect' | 'marksWrong'> {
  const same = [...tests].reverse().find((t) => t.testType === testType) ?? [...tests].reverse().find((t) => t.testType !== 'SECTIONAL' && testType !== 'SECTIONAL');
  return same ? { maxScore: same.maxScore, durationMinutes: same.durationMinutes, marksCorrect: same.marksCorrect, marksWrong: same.marksWrong } : { maxScore: 100, durationMinutes: null, marksCorrect: null, marksWrong: null };
}

export function mockSummary(tests: MockTest[]) {
  const attempted = tests.filter((t) => t.attempts.length > 0);
  /** Full-length papers only, so the trend compares like with like. */
  const fullAttempts = tests
    .filter((t) => t.testType !== 'SECTIONAL')
    .flatMap((t) => t.attempts)
    .sort((a, b) => a.attemptedOn.localeCompare(b.attemptedOn) || a.createdAt.localeCompare(b.createdAt));
  const best = fullAttempts.reduce<MockAttempt | null>((b, a) => (!b || pct(a) > pct(b) ? a : b), null);
  const last = fullAttempts.at(-1) ?? null;
  const trendSpan = Math.min(3, fullAttempts.length);
  const recent = fullAttempts.slice(-trendSpan);
  const avg = recent.length ? recent.reduce((s, a) => s + a.score, 0) / recent.length : null;
  const trend = fullAttempts.length >= 2 ? fullAttempts.at(-1)!.score - fullAttempts.at(-trendSpan)!.score : null;
  return { total: tests.length, attempted: attempted.length, fullAttempts, best, last, avg, trend, trendSpan };
}
