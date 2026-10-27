import { describe, expect, it } from 'vitest';
import { recordUrl, socketOf, storedToken, TOKEN_KEY } from './record';
import { resolveAddress } from '$lib/link/address';

function storage(value: unknown) {
  return { getItem: (key: string) => (key === TOKEN_KEY ? JSON.stringify(value) : null) };
}

describe('socketOf', () => {
  it('gives the same socket url the address rules make', () => {
    for (const address of ['brainsol.local', 'wss://tunnel.example.org', 'http://10.0.0.7:8093', 'https://pi.example.org/brainsol']) {
      for (const protocol of ['http:', 'https:']) {
        const result = resolveAddress(address, { protocol, host: 'sol.example' });
        if (!result.ok) continue;
        expect(socketOf(result.value.http)).toBe(result.value.ws);
      }
    }
  });
});

describe('storedToken', () => {
  const api = 'http://localhost:8093';
  const ws = 'ws://localhost:8093/ws';

  it('reads the token the connection stored for this tracker', () => {
    expect(storedToken(api, storage({ ws, token: 'abc', exp: 2e9 }), 1e12)).toBe('abc');
  });

  it('ignores a token of another tracker, an old one and broken storage', () => {
    expect(storedToken(api, storage({ ws: 'ws://other:8080/ws', token: 'abc', exp: 2e9 }), 1e12)).toBeNull();
    expect(storedToken(api, storage({ ws, token: 'abc', exp: 100 }), 1e12)).toBeNull();
    expect(storedToken(api, { getItem: () => '{not json' })).toBeNull();
    expect(storedToken(api, { getItem: () => null })).toBeNull();
    expect(storedToken(null, storage({ ws, token: 'abc' }))).toBeNull();
    expect(storedToken(api, null)).toBeNull();
  });
});

describe('recordUrl', () => {
  it('puts the token on the csv address of the tracker', () => {
    expect(recordUrl('https://pi.example.org', 'a+b/c=')).toBe('https://pi.example.org/api/record.csv?token=a%2Bb%2Fc%3D');
    expect(recordUrl('http://localhost:8093/', 'x')).toBe('http://localhost:8093/api/record.csv?token=x');
  });
});
