/**
 * Pet Vaccination Resource Types
 * Used for access control configuration
 */
export const PetVaccinationResource = {
  One: 'pet-vaccination',
  Many: 'pet-vaccination',
} as const;

export type PetVaccinationResourceType =
  (typeof PetVaccinationResource)[keyof typeof PetVaccinationResource];
