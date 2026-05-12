// Public surface of the events feature.
//
// `eventsFeature` is the wiring entry-point. `FakeEmailGateway` is
// exported because `test/sample-server.e2e-spec.ts` resolves it via
// `app.get(FakeEmailGateway)` to assert mail delivery.
//
// `PetCreatedEvent`, `PetCreatedEventHook`, and
// `NotifyOnPetCreatedListener` stay internal — consumers reference
// them through the file path (e.g. `pet.resource.ts` imports the
// hook from `../../events/pet-created-event.hook`).
export { FakeEmailGateway } from './email.gateway';
export { eventsFeature } from './events.feature';
