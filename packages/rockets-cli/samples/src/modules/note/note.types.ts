export const NoteResource = {
  One: 'note-one',
  Many: 'note-many',
} as const;

export type NoteResourceType = typeof NoteResource[keyof typeof NoteResource];


