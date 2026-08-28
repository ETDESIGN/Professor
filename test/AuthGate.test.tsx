// test/AuthGate.test.tsx
import { describe, it, expect } from 'vitest';
// isPublicPath must be exported from AuthGate for this test
import { isPublicPath } from '../components/shared/AuthGate';

describe('isPublicPath', () => {
  it('allows the hub landing, login, claim exactly', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/claim')).toBe(true);
    expect(isPublicPath('/claim/ABC123')).toBe(true);
    expect(isPublicPath('/onboarding/parent')).toBe(true);
  });
  it('gates every portal path', () => {
    expect(isPublicPath('/student')).toBe(false);
    expect(isPublicPath('/teacher/units')).toBe(false);
    expect(isPublicPath('/parent')).toBe(false);
    expect(isPublicPath('/admin')).toBe(false);
    expect(isPublicPath('/board')).toBe(false);
    expect(isPublicPath('/remote')).toBe(false);
    expect(isPublicPath('/anything')).toBe(false);
  });
});
