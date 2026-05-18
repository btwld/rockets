import { Injectable } from '@nestjs/common';
import { AbstractRocketsGetRoleByNameHandler } from './abstract-rockets-get-role-by-name.handler';

/**
 * Default `RocketsGetRoleByNameQuery` handler. Empty body — all logic
 * lives in {@link AbstractRocketsGetRoleByNameHandler}. Override single
 * seams by extending the abstract base.
 */
@Injectable()
export class RocketsGetRoleByNameHandler extends AbstractRocketsGetRoleByNameHandler {}
