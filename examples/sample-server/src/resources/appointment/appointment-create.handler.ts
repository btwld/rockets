import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PlainLiteralObject,
} from '@nestjs/common';
import { CrudAdapter, CrudCreateCommand, CrudQueryException } from '@concepta/nestjs-crud';
import { CrudCommandHandlerBase } from '@concepta/rockets-core';
import { RepositoryInterface, TransactionScope, Where } from '@concepta/nestjs-repository';
import { getActor } from '@concepta/rockets-core';
import { PetEntity } from '../pet/pet.schema';
import type { Pet } from '../pet/pet.schema';
import { AppointmentEntity, type AppointmentRow } from './appointment.entity';
import { ReminderEntity } from './reminder.schema';
import type { ReminderRow } from './reminder.schema';
import type { AppointmentCreate } from './appointment.schemas';
import { InjectCrudAdapter, InjectDynamicRepository } from '@concepta/rockets-core';

/**
 * Creates an `Appointment` and its paired `Reminder` atomically.
 *
 * Ownership is checked *inside* `txScope.run` so the read and the two
 * writes share the same snapshot — closing the TOCTOU window where pet
 * ownership could change between a pre-check and the inserts.
 */
@Injectable()
export class AppointmentCreateHandler extends CrudCommandHandlerBase<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(AppointmentEntity)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(AppointmentEntity)
    private readonly apptRepo: RepositoryInterface<AppointmentRow>,
    @InjectDynamicRepository(ReminderEntity)
    private readonly reminderRepo: RepositoryInterface<ReminderRow>,
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    private readonly txScope: TransactionScope,
  ) {
    super(crudAdapter);
  }

  /**
   * `dto` is the validated `appointmentCreateSchema` output: `date` and
   * `reminderSendAt` already arrive as `Date` (`f.date()` coerces the
   * ISO strings on the wire).
   */
  async execute(
    command: CrudCreateCommand<PlainLiteralObject, AppointmentCreate>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;

    const actor = getActor(context);
    if (!actor?.id) {
      throw new ForbiddenException(
        'Authenticated user is required to create an appointment',
      );
    }

    const appointmentDate = dto.date;
    const reminderDate = dto.reminderSendAt;

    try {
      return await this.txScope.run(context, async () => {
        const pet = await this.petRepo.findOne({
          where: Where.and(
            Where.eq<Pet>('id', dto.petId),
            Where.eq<Pet>('userId', actor.id),
          ),
          ctx: context,
        });
        if (!pet) {
          throw new NotFoundException(`Pet ${dto.petId} not found`);
        }

        const appointment = await this.apptRepo.create(
          {
            petId: dto.petId,
            userId: actor.id,
            date: appointmentDate,
            notes: dto.notes,
          },
          { ctx: context },
        );

        // Business invariant after the appointment write so the
        // rollback path covers the "partially committed" case.
        if (reminderDate.getTime() >= appointmentDate.getTime()) {
          throw new BadRequestException(
            'reminderSendAt must be earlier than the appointment date',
          );
        }

        const reminder = await this.reminderRepo.create(
          {
            appointmentId: appointment.id,
            sendAt: reminderDate,
          },
          { ctx: context },
        );

        return { ...appointment, reminders: [reminder] };
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new CrudQueryException(this.crudAdapter.entityName(), {
        originalError: e,
      });
    }
  }
}
