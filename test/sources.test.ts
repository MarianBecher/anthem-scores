import { describe, expect, test } from 'vitest';
import { lyDuration, lyHasTempo, lyPartial } from '../scripts/lib/sources.ts';

describe('LilyPond helpers', () => {
  test('converts durations to quarter-note beats', () => {
    expect(lyDuration('4')).toBe(1);
    expect(lyDuration('8')).toBe(0.5);
    expect(lyDuration('4.')).toBe(1.5);
    expect(lyDuration('2..')).toBe(3.5);
    expect(lyDuration('2*3')).toBe(6);
    expect(lyDuration('4*1/2')).toBe(0.5);
    expect(lyDuration('x')).toBeNull();
  });

  test('reads the pickup from \\partial', () => {
    expect(lyPartial('\\relative c\' { \\time 4/4 \\partial 2 c4 d | e1 }')).toBe(2);
    expect(lyPartial('\\partial 8. g8.')).toBe(0.75);
    expect(lyPartial('c4 d e f')).toBeNull();
    expect(lyPartial(null)).toBeNull();
  });

  test('detects tempo marks', () => {
    expect(lyHasTempo('\\tempo 4 = 96 c4')).toBe(true);
    expect(lyHasTempo('X:1\nQ:1/4=100\nK:C')).toBe(true);
    expect(lyHasTempo('\\time 3/4 c4')).toBe(false);
  });
});
