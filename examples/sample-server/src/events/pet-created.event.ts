/**
 * Pure data carrier — no logic, no services. Listeners read `petId` /
 * `ownerId` and do their own side effects.
 *
 * Convention: events describe what happened, not what to do. A consumer
 * that needs a side effect subscribes via `@EventsHandler(PetCreatedEvent)`
 * — see `NotifyOnPetCreatedListener`.
 */
export class PetCreatedEvent {
  constructor(
    public readonly petId: string,
    public readonly ownerId: string,
    public readonly petName: string,
  ) {}
}
