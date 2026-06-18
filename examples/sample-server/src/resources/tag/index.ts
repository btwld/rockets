// Tag resource — fully zod-driven. `tagSchema` is the source of truth;
// `tag.zod.ts` compiles it into `tagZodResource` + the generated
// `TagEntity`. The handwritten classic twin lives in the test fixtures
// (`test/__fixtures__/tag-classic-control`) as the golden-test control.
export * from './tag.schema';
export * from './tag.zod';
