import { describe, expect, it } from 'vitest';
import { checkAddress, isLocalPage, probeTracker, sameTracker, servedPage, shareLink } from './share';

const https = { protocol: 'https:', host: 'sol.swimmingbrain.dev' };
const http = { protocol: 'http:', host: 'localhost:5173' };

describe('checkAddress', () => {
  it('knows an empty field and the simulation', () => {
    expect(checkAddress('  ', https)).toEqual({ kind: 'empty' });
    expect(checkAddress('sim', https)).toEqual({ kind: 'sim' });
  });

  it('resolves a tracker address the way the connection will', () => {
    expect(checkAddress('wss://tunnel.example.org', https)).toEqual({
      kind: 'ok',
      ws: 'wss://tunnel.example.org/ws',
      http: 'https://tunnel.example.org',
      label: 'tunnel.example.org'
    });
    expect(checkAddress('brainsol.local', http)).toMatchObject({ kind: 'ok', ws: 'ws://brainsol.local:8080/ws' });
  });

  it('explains a plain ws address on the https site with the page the pi serves', () => {
    expect(checkAddress('ws://brainsol.local', https)).toEqual({ kind: 'mixed', host: 'brainsol.local:8080', page: 'http://brainsol.local:8080/' });
    expect(checkAddress('http://10.0.0.7:9000', https)).toEqual({ kind: 'mixed', host: '10.0.0.7:9000', page: 'http://10.0.0.7:9000/' });
  });

  it('lets localhost through on https, the browser allows that', () => {
    expect(checkAddress('ws://localhost:8080', https).kind).toBe('ok');
  });

  it('calls garbage invalid', () => {
    expect(checkAddress('ftp://pi', https)).toEqual({ kind: 'invalid' });
    expect(checkAddress('two words', https)).toEqual({ kind: 'invalid' });
  });
});

describe('servedPage', () => {
  it('adds the tracker port when none is given', () => {
    expect(servedPage('ws://brainsol.local')).toBe('http://brainsol.local:8080/');
    expect(servedPage('brainsol.local:9000/ws')).toBe('http://brainsol.local:9000/');
    expect(servedPage('ws://')).toBeNull();
  });
});

describe('sameTracker', () => {
  it('treats two spellings of one tracker as the same', () => {
    expect(sameTracker('brainsol.local', 'ws://brainsol.local:8080', http)).toBe(true);
    expect(sameTracker('Brainsol.local', 'brainsol.local', https)).toBe(true);
    expect(sameTracker('brainsol.local', 'other.local', http)).toBe(false);
    expect(sameTracker('', 'sim', http)).toBe(true);
    expect(sameTracker('brainsol.local', '', http)).toBe(false);
  });
});

describe('shareLink', () => {
  it('is the plain page when the page finds this tracker by itself', () => {
    expect(shareLink('https://sol.swimmingbrain.dev', 'wss://pi.example.org', 'wss://pi.example.org', https)).toBe('https://sol.swimmingbrain.dev/');
    expect(shareLink('https://sol.swimmingbrain.dev/', null, '', https)).toBe('https://sol.swimmingbrain.dev/');
  });

  it('carries the address when it is not the default one, readable', () => {
    expect(shareLink('https://sol.swimmingbrain.dev', 'wss://tunnel.example.org', '', https)).toBe('https://sol.swimmingbrain.dev/?pi=wss://tunnel.example.org');
    expect(shareLink('http://localhost:5173', 'ws://localhost:8080', null, http)).toBe('http://localhost:5173/?pi=ws://localhost:8080');
    expect(shareLink('https://x.dev', 'pi.local/a b', '', https)).toBe('https://x.dev/?pi=pi.local/a%20b');
  });

  it('asks for the simulation when the default is a tracker', () => {
    expect(shareLink('https://sol.swimmingbrain.dev', null, 'wss://pi.example.org', https)).toBe('https://sol.swimmingbrain.dev/?pi=sim');
  });
});

describe('isLocalPage', () => {
  it('spots pages phones cannot open', () => {
    expect(isLocalPage('localhost')).toBe(true);
    expect(isLocalPage('127.0.0.1')).toBe(true);
    expect(isLocalPage('sol.swimmingbrain.dev')).toBe(false);
    expect(isLocalPage('192.168.1.20')).toBe(false);
  });
});

describe('probeTracker', () => {
  const answer = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('reads the info of a tracker that answers', async () => {
    const info = { name: 'brainsol', version: '0.1.0', proto: 1, driver: 'sim', caps: { lux: true, pv: false, simlight: true }, viewers: 2, uptime: 9 };
    expect(await probeTracker('http://pi:8080/', answer(200, info))).toEqual({ ok: true, info });
  });

  it('tells a wrong answer from no answer', async () => {
    expect(await probeTracker('http://pi:8080', answer(404, { err: 'no' }))).toEqual({ ok: false, reason: 'answer' });
    expect(await probeTracker('http://pi:8080', answer(200, { hello: 1 }))).toEqual({ ok: false, reason: 'answer' });
    const down = (async () => {
      throw new TypeError('failed');
    }) as unknown as typeof fetch;
    expect(await probeTracker('http://pi:8080', down)).toEqual({ ok: false, reason: 'network' });
  });

  it('gives up after the timeout', async () => {
    const never = ((_: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await probeTracker('http://pi:8080', never, 20)).toEqual({ ok: false, reason: 'timeout' });
  });
});
