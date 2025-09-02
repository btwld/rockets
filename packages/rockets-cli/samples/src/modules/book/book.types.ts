export const BookResource = {
  One: 'book-one',
  Many: 'book-many',
} as const;

export type BookResourceType = typeof BookResource[keyof typeof BookResource];


