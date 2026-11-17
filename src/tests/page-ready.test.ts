import { describe, it, expect, vi } from 'vitest';
import { onPageReady } from '../js/utils/page-ready';

describe('onPageReady', () => {
  it('runs every registered callback exactly once after the DOM is ready', async () => {
    const first = vi.fn();
    const second = vi.fn();
    onPageReady(first);
    onPageReady(second);
    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});
