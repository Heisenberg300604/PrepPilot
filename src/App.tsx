import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorState, PageLoading } from '@/components/ui';
import { AuthBridge } from '@/features/auth/AuthBridge';
import { SignInPage, SignUpPage } from '@/features/auth/AuthPages';
import { Landing } from '@/features/auth/Landing';
import { useExams } from '@/features/common/queries';
import { DialogProvider } from '@/lib/dialogs';
import { fromApiTheme, useTheme } from '@/lib/theme';
import { useNoIndex, useProfile } from '@/lib/hooks';
import { useEffect } from 'react';

// The signed-in shell is only downloaded once someone signs in; the landing page stays light.
const AppShell = lazy(() => import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })));
const NotFound = lazy(() => import('@/features/auth/NotFound'));
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Onboarding = lazy(() => import('@/features/onboarding/OnboardingPage'));
const ExamsPage = lazy(() => import('@/features/exams/ExamsPage'));
const ExamPage = lazy(() => import('@/features/exams/ExamPage'));
const SubjectPage = lazy(() => import('@/features/subjects/SubjectPage'));
const PlaylistPage = lazy(() => import('@/features/playlists/PlaylistPage'));
const StudyPage = lazy(() => import('@/features/study/StudyPage'));
const LibraryPage = lazy(() => import('@/features/library/LibraryPage'));
const FavoritesPage = lazy(() => import('@/features/library/FavoritesPage'));
const RecentPage = lazy(() => import('@/features/library/RecentPage'));
const PlannerPage = lazy(() => import('@/features/planner/PlannerPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

/** Adopt the saved profile theme (source of truth across devices). */
function ThemeSync() {
  const profile = useProfile();
  const { pref, setPref } = useTheme();
  useEffect(() => {
    if (profile.data) {
      const saved = fromApiTheme(profile.data.preferredTheme);
      if (saved !== pref) setPref(saved);
    }
    // only when the saved value changes, so a just-picked local choice isn't overwritten mid-save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.preferredTheme]);
  return null;
}

/** New users with nothing created yet are guided through onboarding; everyone else goes straight in. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const exams = useExams();
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Couldn't load your account" />;
  if (profile.isLoading || exams.isLoading) return <PageLoading label="Loading your workspace…" />;
  if (profile.data && !profile.data.onboardingCompleted && (exams.data?.length ?? 0) === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  useNoIndex();
  if (!isLoaded) return <PageLoading label="Checking your session…" />;
  return (
    <>
      <SignedIn>
        <AuthBridge>
          <ThemeSync />
          <DialogProvider>{children}</DialogProvider>
        </AuthBridge>
      </SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}

function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoading label="Loading…" />;
  if (!isSignedIn) return <Landing />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<OnboardingGate><Dashboard /></OnboardingGate>} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:examId" element={<ExamPage />} />
          <Route path="/subjects/:subjectId" element={<SubjectPage />} />
          <Route path="/playlists/:playlistId" element={<PlaylistPage />} />
          <Route path="/watch/:videoId" element={<StudyPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/recent" element={<RecentPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
