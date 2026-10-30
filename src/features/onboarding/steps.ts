import type { Exam, Subject } from '@/lib/types';

export type OnboardingStep = 'exam' | 'subject' | 'content';

export interface OnboardingState {
  step: OnboardingStep;
  exam: Exam | null;
  subject: Subject | null;
}

/**
 * Where setup stands, derived purely from what already exists on the server — so a refresh (or
 * coming back on another device) resumes in the right place without any local-only state.
 */
export function deriveOnboarding(exams: Exam[], subjects: Subject[]): OnboardingState {
  const exam = [...exams].filter((e) => e.status !== 'ARCHIVED').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  if (!exam) return { step: 'exam', exam: null, subject: null };
  const subject = subjects.filter((s) => s.examId === exam.id && !s.archived).sort((a, b) => a.displayOrder - b.displayOrder)[0] ?? null;
  if (!subject) return { step: 'subject', exam, subject: null };
  return { step: 'content', exam, subject };
}

export const SUBJECT_SUGGESTIONS = ['Mathematics', 'English', 'General Knowledge', 'Reasoning', 'Physics', 'Chemistry'];
