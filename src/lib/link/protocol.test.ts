import { describe, expect, it } from 'vitest';
import { pinRefusal } from './protocol';

describe('a refused pin', () => {
  it('reads the tries left from the words of the pi', () => {
    expect(pinRefusal('wrong pin, 4 tries left')).toEqual({ left: 4, noPin: false });
    expect(pinRefusal('wrong pin, 1 try left')).toEqual({ left: 1, noPin: false });
  });

  it('knows a tracker without a pin', () => {
    expect(pinRefusal('no pin is set on the tracker, run brainsolpi setpin on the pi')).toEqual({ left: null, noPin: true });
  });

  it('says nothing about a lock, a missing message or anything else', () => {
    expect(pinRefusal('wrong pin, locked for 30 s')).toEqual({ left: null, noPin: false });
    expect(pinRefusal('too many wrong pins, try again in 12 s')).toEqual({ left: null, noPin: false });
    expect(pinRefusal(undefined)).toEqual({ left: null, noPin: false });
    expect(pinRefusal(42)).toEqual({ left: null, noPin: false });
  });
});
