/**
 * Dynamic repository key for the `pet_tag` join rows (pet ↔ tag).
 * Kept separate from {@link PET_ENTITY_KEY} so junction writes go through
 * `RepositoryInterface` instead of TypeORM `DataSource` / `QueryBuilder`.
 */
export const PET_TAG_ENTITY_KEY = 'petTag';
