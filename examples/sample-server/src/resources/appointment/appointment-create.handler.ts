import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PlainLiteralObject,
} from '@nestjs/common';
import { CrudAdapter, CrudCreateCommand, CrudQueryException } from '@concepta/nestjs-crud';
import { CrudCommandHandlerBase } from '@bitwild/rockets-core';
import { RepositoryInterface, TransactionScope, Where } from '@concepta/nestjs-repository';
import { getActor } from '@bitwild/rockets-core';
import { PetEntity } from '../pet/pet.schema';
import type { Pet } from '../pet/pet.schema';
import { AppointmentEntity, type AppointmentRow } from './appointment.entity';
import { ReminderEntity } from './reminder.schema';
import type { ReminderRow } from './reminder.schema';
import { InjectCrudAdapter, InjectDynamicRepository } from '@bitwild/rockets-core';

type AppointmentCreatePayload = PlainLiteralObject & {
  petId: string;
  date: string | Date;
  reminderSendAt: string | Date;
  notes?: string;
};

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

  async execute(
    command: CrudCreateCommand<PlainLiteralObject, AppointmentCreatePayload>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;

    const actor = getActor(context);
    if (!actor?.id) {
      throw new ForbiddenException(
        'Authenticated user is required to create an appointment',
      );
    }

    const appointmentDate = new Date(dto.date);
    const reminderDate = new Date(dto.reminderSendAt);

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
            // `Reminder` is the wire type — ISO string. The datetime
            // column stores it as a real date either way.
            sendAt: reminderDate.toISOString(),
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
