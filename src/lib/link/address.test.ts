import { describe, expect, it } from 'vitest';
import { isSim, pickAddress, resolveAddress } from './address';

const https = { protocol: 'https:', host: 'sol.swimmingbrain.dev' };
const http = { protocol: 'http:', host: 'brainsol.local:8080' };

function ok(input: string, page = https) {
  const result = resolveAddress(input, page);
  if (!result.ok) throw new Error(`${input} was refused: ${result.problem}`);
  return result.value;
}

describe('an address', () => {
  it('without a scheme means wss on an https page and keeps the default port', () => {
    expect(ok('abc.trycloudflare.com')).toEqual({
      ws: 'wss://abc.trycloudflare.com/ws',
      http: 'https://abc.trycloudflare.com',
      label: 'abc.trycloudflare.com'
    });
  });

  it('without a scheme means ws on a plain http page, with the tracker port 8080', () => {
    expect(ok('raspberrypi.local', http)).toEqual({
      ws: 'ws://raspberrypi.local:8080/ws',
      http: 'http://raspberrypi.local:8080',
      label: 'raspberrypi.local:8080'
    });
  });

  it('keeps a port that is given', () => {
    expect(ok('192.168.1.40:9000', http).ws).toBe('ws://192.168.1.40:9000/ws');
    expect(ok('wss://tracker.example.org:8443').ws).toBe('wss://tracker.example.org:8443/ws');
  });

  it('turns http and https into ws and wss', () => {
    expect(ok('https://abc.trycloudflare.com/').ws).toBe('wss://abc.trycloudflare.com/ws');
    expect(ok('http://brainsol.local', http).ws).toBe('ws://brainsol.local:8080/ws');
  });

  it('does not add /ws twice and keeps a path in front of it', () => {
    expect(ok('wss://abc.trycloudflare.com/ws').ws).toBe('wss://abc.trycloudflare.com/ws');
    expect(ok('wss://example.org/tracker/').ws).toBe('wss://example.org/tracker/ws');
    expect(ok('wss://example.org/tracker/ws').http).toBe('https://example.org/tracker');
  });

  it('refuses a plain ws address on the https site, the browser would block it', () => {
    expect(resolveAddress('ws://192.168.1.40:8080', https)).toEqual({ ok: false, problem: 'mixed' });
    expect(resolveAddress('http://brainsol.local', https)).toEqual({ ok: false, problem: 'mixed' });
  });

  it('lets localhost through on https, browsers allow that one', () => {
    expect(ok('ws://localhost:8080').ws).toBe('ws://localhost:8080/ws');
    expect(ok('ws://127.0.0.1').ws).toBe('ws://127.0.0.1:8080/ws');
  });

  it('means the server of the page itself when it says self', () => {
    expect(ok('self', http)).toEqual({
      ws: 'ws://brainsol.local:8080/ws',
      http: 'http://brainsol.local:8080',
      label: 'brainsol.local:8080'
    });
    expect(ok('self').ws).toBe('wss://sol.swimmingbrain.dev/ws');
  });

  it('refuses what is no address', () => {
    expect(resolveAddress('ftp://pi', https)).toEqual({ ok: false, problem: 'invalid' });
    expect(resolveAddress('two words', https)).toEqual({ ok: false, problem: 'invalid' });
    expect(resolveAddress('user:pw@pi.local', http)).toEqual({ ok: false, problem: 'invalid' });
    expect(resolveAddress('wss://', https)).toEqual({ ok: false, problem: 'invalid' });
  });

  it('is empty when blank or when it asks for the simulation', () => {
    expect(resolveAddress('  ', https)).toEqual({ ok: false, problem: 'empty' });
    expect(resolveAddress('sim', https)).toEqual({ ok: false, problem: 'empty' });
    expect(isSim('SIM')).toBe(true);
    expect(isSim(null)).toBe(true);
    expect(isSim('pi.local')).toBe(false);
  });
});

describe('where the address comes from', () => {
  it('takes ?pi= first, then the saved address, then config.json', () => {
    expect(pickAddress({ query: 'a.local', saved: 'b.local', config: 'c.local' })).toEqual({ address: 'a.local', from: 'query' });
    expect(pickAddress({ query: null, saved: 'b.local', config: 'c.local' })).toEqual({ address: 'b.local', from: 'saved' });
    expect(pickAddress({ query: null, saved: '', config: 'c.local' })).toEqual({ address: 'c.local', from: 'config' });
    expect(pickAddress({ query: null, saved: null, config: null })).toEqual({ address: null, from: null });
  });

  it('runs the simulation for an empty ?pi= or for sim anywhere in front', () => {
    expect(pickAddress({ query: '', saved: 'b.local', config: 'c.local' })).toEqual({ address: null, from: 'query' });
    expect(pickAddress({ query: null, saved: 'sim', config: 'c.local' })).toEqual({ address: null, from: 'saved' });
    expect(pickAddress({ query: null, saved: null, config: '' })).toEqual({ address: null, from: null });
  });
});
