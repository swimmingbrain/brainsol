import { describe, expect, it } from 'vitest';
import { recordUrl } from './record';

describe('recordUrl', () => {
  it('puts the token on the csv address of the tracker', () => {
    expect(recordUrl('https://pi.example.org', 'a+b/c=')).toBe('https://pi.example.org/api/record.csv?token=a%2Bb%2Fc%3D');
    expect(recordUrl('http://localhost:8093/', 'x')).toBe('http://localhost:8093/api/record.csv?token=x');
  });
});
