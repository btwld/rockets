import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PlainLiteralObject,
} from '@nestjs/common';
import {
  CrudAdapter,
  CrudCommandHandler,
  CrudCreateCommand,
  CrudQueryException,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  TransactionScope,
  Where,
} from '@bitwild/rockets-repository';
import { getActor } from '@bitwild/rockets-core';
import { PetEntity } from '../pet/pet.entity';
import { PET_ENTITY_KEY } from '../pet/pet.constants';
import { AppointmentEntity } from './appointment.entity';
import { ReminderEntity } from './reminder.entity';
import {
  APPOINTMENT_ENTITY_KEY,
  REMINDER_ENTITY_KEY,
} from './appointment.constants';

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
export class AppointmentCreateHandler extends CrudCommandHandler<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(APPOINTMENT_ENTITY_KEY)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(APPOINTMENT_ENTITY_KEY)
    private readonly apptRepo: RepositoryInterface<AppointmentEntity>,
    @InjectDynamicRepository(REMINDER_ENTITY_KEY)
    private readonly reminderRepo: RepositoryInterface<ReminderEntity>,
    @InjectDynamicRepository(PET_ENTITY_KEY)
    private readonly petRepo: RepositoryInterface<PetEntity>,
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
            Where.eq<PetEntity>('id', dto.petId),
            Where.eq<PetEntity>('userId', actor.id),
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
