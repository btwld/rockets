// Tag resource — fully zod-driven. `tagSchema` is the source of truth;
// `tag.zod.ts` compiles it into `tagZodResource` + the generated
// `TagEntity`.
export * from './tag.schema';
export * from './tag.zod';
