/**
 * Domain event — fires after the `TransferPetOwnershipCommand` commits.
 * Listeners (welcome-email for the new owner, audit entries, revoking
 * cached ACLs) subscribe without the handler having to know about them.
 */
export class PetTransferredEvent {
  constructor(
    public readonly petId: string,
    public readonly previousOwnerId: string,
    public readonly newOwnerId: string,
    public readonly revokedShareCount: number,
  ) {}
}
