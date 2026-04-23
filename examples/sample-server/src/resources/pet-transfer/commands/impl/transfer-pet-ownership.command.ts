import { PlainLiteralObject } from '@nestjs/common';

/**
 * Pure data carrier. No logic, no services, no async.
 *
 * Discoverability is the main reason this exists as its own class:
 * grepping for `TransferPetOwnershipCommand` immediately lists every
 * dispatch site and the single handler that processes it. The shape is
 * the implicit contract between the controller (or any future consumer
 * — CLI, message queue, scheduled job) and the handler.
 */
export class TransferPetOwnershipCommand {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly petId: string,
    public readonly currentOwnerId: string,
    public readonly newOwnerId: string,
  ) {}
}
