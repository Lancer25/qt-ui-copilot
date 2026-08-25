import { describe, expect, it } from 'vitest';
import { PreviewSessionService } from './preview-session-service';

describe('PreviewSessionService', () => {
  it('exposes the quick/enhanced contract', () => {
    expect(typeof new PreviewSessionService().render).toBe('function');
  });
});
