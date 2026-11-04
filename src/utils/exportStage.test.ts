import { describe, expect, it, vi } from 'vitest';
import { maxExportScale } from './exportStage';

const asBrowser = (userAgent: string, platform: string, maxTouchPoints = 0) =>
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });

describe('maxExportScale', () => {
  it('keeps an iPhone export under iOS’s 16.7 MP canvas limit, as large as allowed', () => {
    asBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5);
    const s = maxExportScale(1080, 1920);
    expect(1080 * s * (1920 * s)).toBeLessThanOrEqual(16_777_216);
    expect(1080 * (s + 0.01) * (1920 * (s + 0.01))).toBeGreaterThan(16_777_216);
  });

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    asBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5);
    expect(maxExportScale(1080, 1920)).toBeLessThan(3);
  });

  it('allows a 3x Story export on a desktop', () => {
    asBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', 'Win32');
    expect(maxExportScale(1080, 1920)).toBeGreaterThanOrEqual(3);
  });

  it('never lets one side pass 16384 px', () => {
    asBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', 'Win32');
    const s = maxExportScale(4000, 1000);
    expect(4000 * s).toBeLessThanOrEqual(16_384);
    expect(s).toBe(4.09);
  });
});
