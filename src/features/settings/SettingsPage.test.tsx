import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/features/library/testUtils';
import SettingsPage from './SettingsPage';

const openUserProfile = vi.fn();
const signOut = vi.fn();
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { imageUrl: '', primaryEmailAddress: { emailAddress: 'asha@example.com' } } }),
  useClerk: () => ({ openUserProfile, signOut }),
}));

const profile = { id: 'p', displayName: 'Asha', avatarUrl: null, preferredTheme: 'SYSTEM', dailyStudyTargetMinutes: 120, completionSuggestPercent: 90, onboardingCompleted: true, createdAt: '' };

describe('SettingsPage', () => {
  it('blocks out-of-range targets client-side and never calls the API', async () => {
    const patch = vi.fn(() => profile);
    stubApi({ 'GET /api/profile': profile, 'PATCH /api/profile': patch });
    renderApp(<SettingsPage />);
    const input = await screen.findByLabelText('Daily study target (minutes)');
    fireEvent.change(input, { target: { value: '2000' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save study preferences' }));
    expect(await screen.findByText(/between 0 and 1440/)).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('saves valid study preferences', async () => {
    const patch = vi.fn(({ body }) => ({ ...profile, ...body }));
    stubApi({ 'GET /api/profile': profile, 'PATCH /api/profile': patch });
    renderApp(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Daily study target (minutes)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText(/Suggest marking complete/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save study preferences' }));
    await vi.waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0][0].body).toEqual({ dailyStudyTargetMinutes: 90, completionSuggestPercent: 0 });
  });

  it('changes the theme instantly and persists it', async () => {
    const patch = vi.fn(({ body }) => ({ ...profile, ...body }));
    stubApi({ 'GET /api/profile': profile, 'PATCH /api/profile': patch });
    renderApp(<SettingsPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /Dark/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await vi.waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0][0].body).toEqual({ preferredTheme: 'DARK' });
  });

  it('hands account management and sign-out to Clerk', async () => {
    stubApi({ 'GET /api/profile': profile });
    renderApp(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage account' }));
    expect(openUserProfile).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
});
