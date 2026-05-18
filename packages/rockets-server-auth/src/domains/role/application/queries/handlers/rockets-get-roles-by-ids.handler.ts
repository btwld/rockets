import { Injectable } from '@nestjs/common';
import { AbstractRocketsGetRolesByIdsHandler } from './abstract-rockets-get-roles-by-ids.handler';

/**
 * Default `RocketsGetRolesByIdsQuery` handler. Empty body — all logic
 * lives in {@link AbstractRocketsGetRolesByIdsHandler}.
 */
@Injectable()
export class RocketsGetRolesByIdsHandler extends AbstractRocketsGetRolesByIdsHandler {}
