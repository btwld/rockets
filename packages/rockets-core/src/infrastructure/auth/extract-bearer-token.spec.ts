import { extractBearerToken } from './extract-bearer-token';
import type { AuthRequest } from '../../domain/interfaces/auth-adapter.interface';

function makeRequest(authorization?: string | string[]): AuthRequest {
  return {
    headers: authorization !== undefined ? { authorization } : {},
    query: {},
    raw: {},
  };
}

describe('extractBearerToken', () => {
  it('returns the token for a valid Bearer header', () => {
    expect(extractBearerToken(makeRequest('Bearer abc123'))).toBe('abc123');
  });

  it('is case-insensitive for the scheme (RFC 7235)', () => {
    expect(extractBearerToken(makeRequest('bearer abc123'))).toBe('abc123');
    expect(extractBearerToken(makeRequest('BEARER abc123'))).toBe('abc123');
    expect(extractBearerToken(makeRequest('Bearer abc123'))).toBe('abc123');
  });

  it('returns null when no Authorization header is present', () => {
    expect(extractBearerToken(makeRequest())).toBeNull();
  });

  it('returns null for an empty Authorization header', () => {
    expect(extractBearerToken(makeRequest(''))).toBeNull();
  });

  it('returns null for non-Bearer schemes', () => {
    expect(extractBearerToken(makeRequest('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(extractBearerToken(makeRequest('Digest realm="test"'))).toBeNull();
    expect(extractBearerToken(makeRequest('ApiKey secretkey'))).toBeNull();
  });

  it('returns null when the Bearer token is empty or whitespace only', () => {
    expect(extractBearerToken(makeRequest('Bearer '))).toBeNull();
    expect(extractBearerToken(makeRequest('Bearer    '))).toBeNull();
  });

  it('trims whitespace from the token', () => {
    expect(extractBearerToken(makeRequest('Bearer   abc123   '))).toBe(
      'abc123',
    );
  });

  it('returns null when no space between scheme and token', () => {
    expect(extractBearerToken(makeRequest('Bearertoken'))).toBeNull();
  });

  it('uses the first element when authorization is an array', () => {
    expect(
      extractBearerToken(makeRequest(['Bearer first', 'Bearer second'])),
    ).toBe('first');
  });

  it('returns null when the array contains an empty string', () => {
    expect(extractBearerToken(makeRequest(['']))).toBeNull();
  });

  it('handles tokens with special characters', () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.payload.signature';
    expect(extractBearerToken(makeRequest(`Bearer ${token}`))).toBe(token);
  });
});
