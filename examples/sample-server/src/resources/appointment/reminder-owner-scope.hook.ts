import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  BeforeFindAndCount,
  BeforeFindOne,
  InjectDynamicRepository,
  RepoHook,
  RepositoryFindOneOptions,
  RepositoryFindOptions,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { getActor } from '@bitwild/rockets-core';
import { ReminderEntity } from './reminder.entity';
import { AppointmentEntity } from './appointment.entity';
import { APPOINTMENT_ENTITY_KEY } from './appointment.constants';

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
@Injectable()
@RepoHook()
export class ReminderOwnerScopeHook {
  constructor(
    @InjectDynamicRepository(APPOINTMENT_ENTITY_KEY)
    private readonly apptRepo: RepositoryInterface<AppointmentEntity>,
  ) {}

  @BeforeFindAndCount()
  async scopeList(
    options: RepositoryFindOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOptions<PlainLiteralObject>> {
    return this.applyScope(options, ctx);
  }

  @BeforeFindOne()
  async scopeOne(
    options: RepositoryFindOneOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOneOptions<PlainLiteralObject>> {
    return this.applyScope(options, ctx);
  }

  private async applyScope<
    T extends
      | RepositoryFindOptions<PlainLiteralObject>
      | RepositoryFindOneOptions<PlainLiteralObject>,
  >(options: T, ctx?: PlainLiteralObject): Promise<T> {
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
