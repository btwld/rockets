import { Injectable, PlainLiteralObject } from '@nestjs/common';
import { type RepositoryFindOneOptions, type RepositoryFindOptions, type RepositoryInterface, Where } from '@concepta/nestjs-repository';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
  getActor,
} from '@bitwild/rockets-core';
import { ReminderEntity } from './reminder.schema';
import { AppointmentEntity, type AppointmentRow } from './appointment.entity';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

/**
 * Scopes reminders to the authenticated user's own appointments.
 *
 * The upstream `OwnerScopeHook` only handles entities with a direct
 * `userId` column. Reminder ownership is indirect — it lives on the
 * parent appointment. This hook resolves that by first loading the
 * user's appointment ids, then restricting reminder queries to
 * `appointmentId IN (...)`.
 *
 * Performance trade-off: one extra round-trip per read. Acceptable for
 * a sample and for apps where appointment cardinality per user stays
 * bounded. For very large users, denormalize `userId` onto the reminder
 * row and switch back to `OwnerScopeHook`.
 *
 * Typed `PlainLiteralObject`, not `Reminder`: zod resources are
 * `CrudResource<PlainLiteralObject>` and `RocketsEntityHookForResource`
 * is invariant in the row type — a `Reminder`-typed hook does not
 * satisfy the resource's `hooks` field.
 */
@EntityHook({ entity: ReminderEntity })
@Injectable()
export class ReminderOwnerScopeHook extends PassthroughEntityHookBase<PlainLiteralObject> {
  constructor(
    @InjectDynamicRepository(AppointmentEntity)
    private readonly apptRepo: RepositoryInterface<AppointmentRow>,
  ) {
    super();
  }

  override async beforeFindAndCount(
    options: RepositoryFindOptions<PlainLiteralObject>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOptions<PlainLiteralObject>> {
    return this.applyScope(options, ctx);
  }

  override async beforeFindOne(
    options: RepositoryFindOneOptions<PlainLiteralObject>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOneOptions<PlainLiteralObject>> {
    return this.applyScope(options, ctx);
  }

  private async applyScope<
    T extends
      | RepositoryFindOptions<PlainLiteralObject>
      | RepositoryFindOneOptions<PlainLiteralObject>,
  >(options: T, ctx?: EntityHookContext): Promise<T> {
    const actor = getActor(ctx);
    if (!actor?.id) return options;

    const appointments = await this.apptRepo.find({
      where: Where.eq<AppointmentRow>('userId', actor.id),
    });
    const appointmentIds = appointments.map((a) => a.id);

    // No appointments → no reminders. `Where.in('id', [])` is treated as
    // a "match nothing" clause by the upstream repository, so the result
    // set is empty rather than unscoped.
    const clause = Where.in<PlainLiteralObject>('appointmentId', appointmentIds);

    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}
