// A curated set instead of the whole lucide catalogue: named imports are tree-shaken, so only these
// ~20 small SVG components ship (a few KB gzipped), with no runtime lookup or extra network requests.
import {
  Anchor,
  Atom,
  Banknote,
  BookOpen,
  Briefcase,
  Calculator,
  Cpu,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  Languages,
  Medal,
  Plane,
  Scale,
  Shield,
  Stethoscope,
  Target,
  TrainFront,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** Stored in Exam.icon. Keys are stable; never rename one (existing exams reference it). */
export const EXAM_ICONS: { key: string; name: string; icon: LucideIcon }[] = [
  { key: 'graduation-cap', name: 'General', icon: GraduationCap },
  { key: 'plane', name: 'Air Force', icon: Plane },
  { key: 'shield', name: 'Defence', icon: Shield },
  { key: 'anchor', name: 'Navy', icon: Anchor },
  { key: 'medal', name: 'Medal', icon: Medal },
  { key: 'landmark', name: 'Civil services', icon: Landmark },
  { key: 'scale', name: 'Law', icon: Scale },
  { key: 'banknote', name: 'Banking', icon: Banknote },
  { key: 'briefcase', name: 'Management', icon: Briefcase },
  { key: 'train', name: 'Railways', icon: TrainFront },
  { key: 'stethoscope', name: 'Medical', icon: Stethoscope },
  { key: 'atom', name: 'Science', icon: Atom },
  { key: 'flask', name: 'Chemistry', icon: FlaskConical },
  { key: 'cpu', name: 'Engineering', icon: Cpu },
  { key: 'calculator', name: 'Maths', icon: Calculator },
  { key: 'languages', name: 'Languages', icon: Languages },
  { key: 'globe', name: 'General studies', icon: Globe },
  { key: 'book', name: 'Book', icon: BookOpen },
  { key: 'target', name: 'Target', icon: Target },
  { key: 'trophy', name: 'Trophy', icon: Trophy },
];

const BY_KEY = new Map(EXAM_ICONS.map((i) => [i.key, i.icon]));

/** Unknown or empty keys fall back to the graduation cap, so old/bad data never breaks a card. */
export const examIcon = (key?: string | null): LucideIcon => (key && BY_KEY.get(key)) || GraduationCap;

export function ExamEmblem({ icon, size = 22 }: { icon?: string | null; size?: number }) {
  const Icon = examIcon(icon);
  return <Icon size={size} aria-hidden />;
}
