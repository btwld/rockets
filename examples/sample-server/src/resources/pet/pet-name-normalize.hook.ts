import { PlainLiteralObject } from '@nestjs/common';
import { defineHook } from '@bitwild/rockets-core';
import { PetEntity } from './pet.schema';

/**
 * No-DI functional hook: trims `name` before create/update. Shows the
 * simplest {@link defineHook} shape — pure lifecycle functions, no
 * `tools` needed.
 */
export const PetNameNormalizeHook = defineHook<PlainLiteralObject>(PetEntity, {
  beforeCreate: (payload) => normalizeName(payload),
  beforeUpdate: (payload) => normalizeName(payload),
});

function normalizeName(payload: PlainLiteralObject): PlainLiteralObject {
  return typeof payload.name === 'string'
    ? { ...payload, name: payload.name.trim() }
    : payload;
}
