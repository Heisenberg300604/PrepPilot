/**
 * TEST DOUBLE for @clerk/clerk-react, used ONLY by the e2e Vite config (e2e/vite.e2e.config.ts).
 * It lets browser journeys run without a real Clerk account. It does NOT test Clerk itself:
 * real sign-up/sign-in must be verified manually or with @clerk/testing + real credentials (see README).
 * The identity is kept in localStorage under "e2e-user"; the "token" is just that id, which e2e/dev-api.ts accepts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const KEY = 'e2e-user';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string | null) => {
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('e2e-auth'));
};
function useUserId() {
  const [id, setId] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener('e2e-auth', on);
    return () => window.removeEventListener('e2e-auth', on);
  }, []);
  return id;
}

const Ctx = createContext<string | null>(null);
export function ClerkProvider({ children }: { children: ReactNode }) {
  const id = useUserId();
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}
export const useAuth = () => {
  const id = useContext(Ctx);
  return { isLoaded: true, isSignedIn: Boolean(id), userId: id, getToken: async () => id };
};
export const SignedIn = ({ children }: { children: ReactNode }) => (useContext(Ctx) ? <>{children}</> : null);
export const SignedOut = ({ children }: { children: ReactNode }) => (useContext(Ctx) ? null : <>{children}</>);
export const useUser = () => ({ isLoaded: true, user: { id: useContext(Ctx), fullName: 'E2E Student', imageUrl: '', primaryEmailAddress: { emailAddress: 'e2e@example.com' } } });
export const useClerk = () => ({ signOut: async () => write(null), openUserProfile: () => undefined });
export const SignOutButton = ({ children }: { children?: ReactNode }) => <span onClick={() => write(null)}>{children ?? <button>Sign out</button>}</span>;
export const UserButton = () => (
  <button aria-label="Account" className="icon-btn" onClick={() => write(null)}>
    E
  </button>
);
export const UserProfile = () => <div>Clerk account management (test double)</div>;

function Form({ title, cta }: { title: string; cta: string }) {
  const [name, setName] = useState('e2e-user-1');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        write(name);
        history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      style={{ display: 'grid', gap: 12, minWidth: 280 }}
    >
      <h2>{title} (test double)</h2>
      <label>
        User id
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn btn-primary">{cta}</button>
    </form>
  );
}
export const SignIn = () => <Form title="Sign in" cta="Continue" />;
export const SignUp = () => <Form title="Sign up" cta="Create account" />;
const redirectTo = (to: string) => () => {
  history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
export const SignInButton = ({ children }: { children: ReactNode }) => <span onClick={redirectTo('/sign-in')}>{children}</span>;
export const SignUpButton = ({ children }: { children: ReactNode }) => <span onClick={redirectTo('/sign-up')}>{children}</span>;
