import { KeyRound } from 'lucide-react';
import { Brand } from '@/components/layout/Brand';

/** Shown instead of a broken app when the Clerk publishable key is missing. */
export function SetupScreen() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <Brand />
        <div className="empty-icon">
          <KeyRound size={22} aria-hidden />
        </div>
        <h1>Almost there — connect Clerk</h1>
        <p>
          PrepPilot uses <strong>Clerk</strong> for sign-in, and no publishable key was found, so authentication is not connected.
        </p>
        <ol>
          <li>
            Create an application at <a href="https://dashboard.clerk.com">dashboard.clerk.com</a>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_CLERK_PUBLISHABLE_KEY</code>, <code>CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code>.
          </li>
          <li>Restart <code>npm run dev</code>.</li>
        </ol>
        <p className="muted">Full instructions are in the README.</p>
      </div>
    </main>
  );
}
