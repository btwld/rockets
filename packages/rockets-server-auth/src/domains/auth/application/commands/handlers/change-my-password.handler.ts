import { Injectable } from '@nestjs/common';
import { AbstractChangeMyPasswordHandler } from './abstract-change-my-password.handler';

/**
 * Default `ChangeMyPasswordCommand` handler. Empty body — all logic lives
 * in {@link AbstractChangeMyPasswordHandler}. Override single steps by
 * extending the abstract base.
 */
@Injectable()
export class ChangeMyPasswordHandler extends AbstractChangeMyPasswordHandler {}
