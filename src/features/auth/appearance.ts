/** Styles Clerk's prebuilt components with PrepPilot's CSS variables, so they follow light/dark themes. */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#4f46e5',
    colorBackground: 'var(--surface)',
    colorText: 'var(--text)',
    colorTextSecondary: 'var(--text-2)',
    colorInputBackground: 'var(--surface)',
    colorInputText: 'var(--text)',
    colorNeutral: 'var(--text)',
    borderRadius: '10px',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  elements: {
    card: { boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' },
    footer: { background: 'transparent' },
  },
};
