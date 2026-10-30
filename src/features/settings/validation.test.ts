import { describe, expect, it } from 'vitest';
import { validateDisplayName, validateSuggestPercent, validateTarget } from './validation';

describe('settings validation', () => {
  it('accepts targets 0–1440', () => {
    expect(validateTarget('0').value).toBe(0);
    expect(validateTarget(' 120 ').value).toBe(120);
    expect(validateTarget('1440').value).toBe(1440);
  });
  it('rejects out-of-range, blank and fractional targets', () => {
    expect(validateTarget('1441').error).toMatch(/between 0 and 1440/);
    expect(validateTarget('-1').error).toMatch(/between/);
    expect(validateTarget('').error).toMatch(/Enter a number/);
    expect(validateTarget('1.5').error).toMatch(/whole number/);
    expect(validateTarget('abc').error).toMatch(/whole number/);
  });
  it('bounds the completion suggestion at 0–100 (0 disables)', () => {
    expect(validateSuggestPercent('0').value).toBe(0);
    expect(validateSuggestPercent('100').value).toBe(100);
    expect(validateSuggestPercent('101').error).toBeTruthy();
  });
  it('validates display names', () => {
    expect(validateDisplayName('  Asha ').value).toBe('Asha');
    expect(validateDisplayName('   ').error).toBeTruthy();
    expect(validateDisplayName('x'.repeat(81)).error).toBeTruthy();
  });
});
