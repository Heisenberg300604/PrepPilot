import { describe, expect, it } from 'vitest';
import { addDays, daysUntil, formatDate, formatDuration, formatMinutes, greeting, initials, locationText, parseKey, plural, relativeDay, statusLabel, timeAgo, toDateKey } from './format';

describe('formatDuration', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(3599.6)).toBe('1:00:00');
  });
  it('is safe for missing/invalid values', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('formatMinutes', () => {
  it('formats planner estimates', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(80)).toBe('1h 20m');
  });
});

describe('date keys', () => {
  it('round-trips local dates', () => {
    const d = new Date(2027, 0, 5, 23, 59);
    expect(toDateKey(d)).toBe('2027-01-05');
    expect(toDateKey(parseKey('2027-01-05'))).toBe('2027-01-05');
  });
  it('rolls over months, years and leap days', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('adds days by calendar, unaffected by DST transitions', () => {
    // US spring-forward / fall-back and EU transitions: one calendar day is always one key
    for (const start of ['2027-03-13', '2027-03-27', '2027-10-30', '2027-11-06']) {
      expect(addDays(addDays(start, 1), -1)).toBe(start);
      expect(daysUntil(addDays(start, 1), start)).toBe(1);
      expect(daysUntil(addDays(start, 7), start)).toBe(7);
    }
  });
  it('zero-pads', () => {
    expect(toDateKey(new Date(2027, 2, 4))).toBe('2027-03-04');
  });
});

describe('relative dates', () => {
  it('names nearby days', () => {
    expect(relativeDay('2027-05-10', '2027-05-10')).toBe('Today');
    expect(relativeDay('2027-05-11', '2027-05-10')).toBe('Tomorrow');
    expect(relativeDay('2027-05-09', '2027-05-10')).toBe('Yesterday');
    expect(relativeDay('2027-05-20', '2027-05-10')).not.toMatch(/Today|Tomorrow|Yesterday/);
  });
  it('counts days until', () => {
    expect(daysUntil('2027-05-20', '2027-05-10')).toBe(10);
    expect(daysUntil('2027-05-01', '2027-05-10')).toBe(-9);
    expect(daysUntil('2027-05-10', '2027-05-10')).toBe(0);
  });
  it('formatDate handles empty input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('2027-05-10')).toContain('2027');
  });
});

describe('greeting', () => {
  it.each([
    [3, 'Hello'],
    [9, 'Good morning'],
    [13, 'Good afternoon'],
    [20, 'Good evening'],
  ])('at %i:00 says %s', (hour, text) => {
    expect(greeting(new Date(2027, 0, 1, hour))).toBe(text);
  });
});

describe('timeAgo', () => {
  const now = new Date('2027-01-10T12:00:00Z').getTime();
  it('formats elapsed time', () => {
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('2027-01-10T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2027-01-10T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2027-01-10T07:00:00Z', now)).toBe('5h ago');
    expect(timeAgo('2027-01-08T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo('2026-12-01T12:00:00Z', now)).toMatch(/\w/);
  });
  it('never goes negative for future timestamps', () => {
    expect(timeAgo('2027-01-10T13:00:00Z', now)).toBe('just now');
  });
});

describe('small helpers', () => {
  it('plural', () => {
    expect(plural(1, 'video')).toBe('1 video');
    expect(plural(0, 'video')).toBe('0 videos');
    expect(plural(2, 'class', 'classes')).toBe('2 classes');
  });
  it('statusLabel', () => {
    expect(statusLabel('NOT_STARTED')).toBe('Not started');
    expect(statusLabel('IN_PROGRESS')).toBe('In progress');
    expect(statusLabel('COMPLETED')).toBe('Completed');
  });
  it('locationText', () => {
    expect(locationText(null)).toBe('Not filed yet');
    expect(locationText({ examName: 'CDS', subjectName: 'Maths', folderPath: ['Main', 'Algebra'] })).toBe('CDS › Maths › Main › Algebra');
    expect(locationText({ examName: 'CDS', subjectName: 'Maths', folderPath: [] })).toBe('CDS › Maths');
  });
  it('initials', () => {
    expect(initials('Asha Rao')).toBe('AR');
    expect(initials('  madonna ')).toBe('M');
    expect(initials('a b c')).toBe('AB');
    expect(initials(null)).toBe('P');
    expect(initials('')).toBe('P');
  });
});
