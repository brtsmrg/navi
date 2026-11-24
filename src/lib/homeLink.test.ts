import { describe, expect, it } from 'vitest';
import { parseHomeCode } from './homeLink';

const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('home voice link', () => {
  it('reads a good code', () => {
    expect(parseHomeCode(enc({ u: 'https://quiet-river-1234.trycloudflare.com', t: 'abcdefghijklmnopqrstuvwx' }))).toEqual({ url: 'https://quiet-river-1234.trycloudflare.com', token: 'abcdefghijklmnopqrstuvwx' });
  });
  it('refuses other addresses, plain http and short tokens', () => {
    expect(parseHomeCode(enc({ u: 'https://evil.example.com', t: 'abcdefghijklmnopqrstuvwx' }))).toBeNull();
    expect(parseHomeCode(enc({ u: 'http://a-b-c.trycloudflare.com', t: 'abcdefghijklmnopqrstuvwx' }))).toBeNull();
    expect(parseHomeCode(enc({ u: 'https://a-b-c.trycloudflare.com', t: 'short' }))).toBeNull();
    expect(parseHomeCode('not-base64!!')).toBeNull();
  });
});
