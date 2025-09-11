import { DynamicModule } from '@nestjs/common';

/**
 * Rockets Server module extras interface
 */
export interface RocketsServerOptionsExtrasInterface
extends Pick<DynamicModule, 'global' | 'controllers'> {

}
