import { SignIn, SignUp } from '@clerk/clerk-react';
import { Brand } from '@/components/layout/Brand';
import { brand } from '@/config/brand';
import { useDocumentTitle, useNoIndex } from '@/lib/hooks';
import { clerkAppearance } from './appearance';

function AuthFrame({ children, heading, sub }: { children: React.ReactNode; heading: string; sub: string }) {
  useNoIndex();
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Brand />
        <div>
          <h1>{heading}</h1>
          <p>{sub}</p>
        </div>
        <ul className="auth-points">
          <li>Organise every exam, subject and folder</li>
          <li>Import YouTube playlists and track each lecture</li>
          <li>Plan your day and see real progress</li>
        </ul>
        <small>{brand.tagline}</small>
      </aside>
      <section className="auth-main">{children}</section>
    </main>
  );
}

export function SignInPage() {
  useDocumentTitle('Sign in');
  return (
    <AuthFrame heading="Welcome back" sub="Pick up exactly where you left off.">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" appearance={clerkAppearance} />
    </AuthFrame>
  );
}

export function SignUpPage() {
  useDocumentTitle('Create your account');
  return (
    <AuthFrame heading="Start preparing with focus" sub="Free to start. Your data stays yours.">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/" appearance={clerkAppearance} />
    </AuthFrame>
  );
}
