import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/clerk-react', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <span data-testid="sign-in-wrapper">{children}</span>,
  SignUpButton: ({ children }: { children: ReactNode }) => <span data-testid="sign-up-wrapper">{children}</span>,
}));

import { brand } from '@/config/brand';
import { Landing } from './Landing';
import { SetupScreen } from './SetupScreen';

afterEach(cleanup);
const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SetupScreen', () => {
  it('explains how to connect Clerk instead of rendering a broken app', () => {
    wrap(<SetupScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/connect Clerk/i);
    expect(screen.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeInTheDocument();
    expect(screen.getByText('CLERK_SECRET_KEY')).toBeInTheDocument();
    expect(screen.getByText('.env.example')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'dashboard.clerk.com' })).toHaveAttribute('href', 'https://dashboard.clerk.com');
  });
  it('shows the PrepPilot brand', () => {
    wrap(<SetupScreen />);
    expect(screen.getByRole('link', { name: `${brand.name} home` })).toBeInTheDocument();
  });
});

describe('Landing (signed-out home)', () => {
  it('shows the tagline and honest product description', () => {
    wrap(<Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your preparation. Your pace. Your progress.');
    expect(screen.getByText(/never downloads or rehosts content/i)).toBeInTheDocument();
  });
  it('offers sign-in and sign-up controls through Clerk', () => {
    wrap(<Landing />);
    expect(screen.getAllByTestId('sign-in-wrapper').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('sign-up-wrapper').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your free workspace' })).toBeInTheDocument();
  });
  it('lists the feature highlights', () => {
    wrap(<Landing />);
    expect(screen.getByRole('region', { name: 'Features' }).querySelectorAll('article').length).toBeGreaterThanOrEqual(6);
  });
  it('never mentions the old product name', () => {
    const { container } = wrap(<Landing />);
    expect(container.textContent).not.toMatch(/studyspace/i);
  });
});
