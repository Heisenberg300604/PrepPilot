import { describe, expect, it } from 'vitest';
import type { Exam, Subject } from '@/lib/types';
import { deriveOnboarding } from './steps';

const exam = (id: string, over: Partial<Exam> = {}) => ({ id, name: id, status: 'ACTIVE', createdAt: `2026-01-0${id.length}T00:00:00Z`, ...over }) as Exam;
const subject = (id: string, examId: string, over: Partial<Subject> = {}) => ({ id, examId, name: id, archived: false, displayOrder: 0, ...over }) as Subject;

describe('deriveOnboarding', () => {
  it('starts at exam creation when nothing exists', () => {
    expect(deriveOnboarding([], [])).toEqual({ step: 'exam', exam: null, subject: null });
  });
  it('resumes at subject once an exam exists, ignoring archived exams', () => {
    expect(deriveOnboarding([exam('a', { status: 'ARCHIVED' })], []).step).toBe('exam');
    const s = deriveOnboarding([exam('a')], [subject('x', 'other')]);
    expect(s.step).toBe('subject');
    expect(s.exam?.id).toBe('a');
  });
  it('moves to content once the exam has a subject', () => {
    const s = deriveOnboarding([exam('a')], [subject('x', 'a')]);
    expect(s).toMatchObject({ step: 'content', subject: { id: 'x' } });
    expect(deriveOnboarding([exam('a')], [subject('x', 'a', { archived: true })]).step).toBe('subject');
  });
});
