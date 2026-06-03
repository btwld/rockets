export function throwOnDuplicateEntity(
  entityName: string,
  originA: string,
  originB: string,
): never {
  throw new Error(
    `buildAppRegistrationPlan: entity \`${entityName}\` registered twice — ` +
      `first by ${originA}, then by ${originB}. Each entity class must be ` +
      `registered exactly once per app. Pick one bundle to own the entity ` +
      `and reach for it from the other via \`@InjectDynamicRepository(KEY)\`.`,
  );
}
