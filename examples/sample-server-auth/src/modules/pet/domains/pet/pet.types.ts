export const PetResource = {
  One: 'pet',
  Many: 'pet',
} as const;

export type PetResourceType = (typeof PetResource)[keyof typeof PetResource];
