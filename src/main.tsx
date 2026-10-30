import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import App from './App';
import { Toaster } from './components/ui';
import { SetupScreen } from './features/auth/SetupScreen';
import { clerkAppearance } from './features/auth/appearance';
import { ApiError } from './lib/api';
import { ThemeProvider } from './lib/theme';
import './styles/index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function ClerkWithRouter() {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      appearance={clerkAppearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        {publishableKey ? (
          <QueryClientProvider client={queryClient}>
            <ClerkWithRouter />
          </QueryClientProvider>
        ) : (
          <SetupScreen />
        )}
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
