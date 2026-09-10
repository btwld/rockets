import { describe, expect, it } from 'vitest';

import * as publicZodApi from '@concepta/rockets-core/zod';

describe('@concepta/rockets-core/zod public API', () => {
  it('exposes the schema-engine surface and none of the retired DTO helpers', () => {
    const exports = publicZodApi as Record<string, unknown>;

    expect(exports).toMatchObject({
      zodResource: expect.any(Function),
      zodSubResource: expect.any(Function),
      operationResource: expect.any(Function),
      buildResponseSchema: expect.any(Function),
      defineZodUserMetadata: expect.any(Function),
    });
    expect(publicZodApi.f.date).toEqual(expect.any(Function));
    expect(publicZodApi.f.compute).toEqual(expect.any(Function));

    for (const retired of [
      'compileDtoClass',
      'namedZodDto',
      'createPaginatedDto',
      'ZodBodyValidationInterceptor',
    ]) {
      expect(exports).not.toHaveProperty(retired);
    }
  });
});
