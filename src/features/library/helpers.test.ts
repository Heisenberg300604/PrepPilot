import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, hasActiveFilters, readFilters, toVideoQuery, writeFilters } from './helpers';

describe('library filters <-> URL', () => {
  it('defaults when the URL is empty or contains junk', () => {
    expect(readFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
    expect(readFilters(new URLSearchParams('status=bogus&sort=nope&tab=x')).status).toBe('all');
    expect(readFilters(new URLSearchParams('sort=nope')).sort).toBe('added');
  });

  it('round-trips and omits defaults', () => {
    const f = { ...DEFAULT_FILTERS, q: ' limits ', status: 'COMPLETED' as const, sort: 'title' as const, examId: 'e1', subjectId: 's1', tab: 'lectures' as const };
    const sp = writeFilters(f);
    expect(sp.toString()).toBe('q=limits&status=COMPLETED&sort=title&exam=e1&subject=s1');
    expect(readFilters(sp)).toEqual({ ...f, q: 'limits' });
    expect(writeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('maps filters to the API query', () => {
    expect(toVideoQuery(DEFAULT_FILTERS)).toEqual({ sort: 'added' });
    expect(toVideoQuery({ ...DEFAULT_FILTERS, status: 'favorites' })).toEqual({ sort: 'added', favorite: true });
    expect(toVideoQuery({ ...DEFAULT_FILTERS, status: 'IN_PROGRESS', q: ' x ', examId: 'e', subjectId: 's' })).toEqual({ sort: 'added', status: 'IN_PROGRESS', q: 'x', examId: 'e', subjectId: 's' });
    // "Not filed" overrides exam/subject
    expect(toVideoQuery({ ...DEFAULT_FILTERS, unfiled: true, examId: 'e' })).toEqual({ sort: 'added', unfiled: true });
  });

  it('knows when filters are active (sort and tab are not filters)', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'title', tab: 'playlists' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, unfiled: true })).toBe(true);
  });
});
