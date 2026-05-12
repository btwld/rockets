import { Injectable } from '@nestjs/common';
import {
  InjectDynamicRepository,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
  type RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
  getActor,
} from '@bitwild/rockets-core';
import { ReminderEntity } from './reminder.entity';
import { AppointmentEntity } from './appointment.entity';

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
 */
@EntityHook({ entity: ReminderEntity })
@Injectable()
export class ReminderOwnerScopeHook extends PassthroughEntityHookBase<ReminderEntity> {
  constructor(
    @InjectDynamicRepository(AppointmentEntity)
    private readonly apptRepo: RepositoryInterface<AppointmentEntity>,
  ) {
    super();
  }

  override async beforeFindAndCount(
    options: RepositoryFindOptions<ReminderEntity>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOptions<ReminderEntity>> {
    return this.applyScope(options, ctx);
  }

  override async beforeFindOne(
    options: RepositoryFindOneOptions<ReminderEntity>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOneOptions<ReminderEntity>> {
    return this.applyScope(options, ctx);
  }

  private async applyScope<
    T extends
      | RepositoryFindOptions<ReminderEntity>
      | RepositoryFindOneOptions<ReminderEntity>,
  >(options: T, ctx?: EntityHookContext): Promise<T> {
    const actor = getActor(ctx);
    if (!actor?.id) return options;

    const appointments = await this.apptRepo.find({
      where: Where.eq<AppointmentEntity>('userId', actor.id),
    });
    const appointmentIds = appointments.map((a) => a.id);

    // No appointments → no reminders. `Where.in('id', [])` is treated as
    // a "match nothing" clause by the upstream repository, so the result
    // set is empty rather than unscoped.
    const clause = Where.in<ReminderEntity>('appointmentId', appointmentIds);

    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}
