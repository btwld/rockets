import { describe, expect, it } from 'vitest';

import {
  ROCKETS_ERROR_DETAILS,
  attachErrorDetails,
  readErrorDetails,
} from './validation-error-details.util';

describe('attachErrorDetails / readErrorDetails', () => {
  it('round-trips a detail list through the symbol carrier', () => {
    const err = new Error('boom');
    attachErrorDetails(err, [{ path: ['name'], message: 'required' }]);

    expect(readErrorDetails(err)).toEqual([
      { path: ['name'], message: 'required' },
    ]);
    // The carrier must stay out of the enumerable/JSON surface.
    expect(JSON.stringify(err)).not.toContain('required');
  });

  it('no-ops on an empty list', () => {
    const err = new Error('boom');
    attachErrorDetails(err, []);

    expect(readErrorDetails(err)).toBeUndefined();
    expect(Object.getOwnPropertySymbols(err)).not.toContain(
      ROCKETS_ERROR_DETAILS,
    );
  });

  it('no-ops on a frozen exception instead of throwing', () => {
    const err = Object.freeze(new Error('frozen'));

    expect(() =>
      attachErrorDetails(err, [{ path: [], message: 'finding' }]),
    ).not.toThrow();
    expect(readErrorDetails(err)).toBeUndefined();
  });

  it('drops a carried list with any malformed entry as a whole', () => {
    const err = new Error('boom');
    Object.defineProperty(err, ROCKETS_ERROR_DETAILS, {
      value: [
        { path: ['ok'], message: 'well-formed' },
        { path: [{ nested: true }], message: 'bad segment type' },
      ],
      enumerable: false,
    });

    expect(readErrorDetails(err)).toBeUndefined();
  });

  it('re-attach replaces the previous list instead of throwing', () => {
    const err = new Error('boom');
    attachErrorDetails(err, [{ path: ['a'], message: 'first' }]);
    attachErrorDetails(err, [{ path: ['b'], message: 'second' }]);

    expect(readErrorDetails(err)).toEqual([{ path: ['b'], message: 'second' }]);
  });
});
