import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsString,
  IsDate,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import { PetAppointmentStatus } from './pet-appointment.interface';

/**
 * Pet Appointment DTO
 * Used for API responses when fetching appointment data
 */
export class PetAppointmentDto {
  @ApiProperty({
    description: 'Appointment unique identifier',
    example: 'appt-123',
  })
  @Expose()
  id!: string;

  @ApiProperty({
    description: 'Pet ID',
    example: 'pet-123',
  })
  @Expose()
  petId!: string;

  @ApiProperty({
    description: 'Appointment date and time',
    example: '2023-01-15T14:00:00.000Z',
    type: Date,
  })
  @Expose()
  appointmentDate!: Date;

  @ApiProperty({
    description: 'Type of appointment',
    example: 'checkup',
  })
  @Expose()
  appointmentType!: string;

  @ApiProperty({
    description: 'Veterinarian name',
    example: 'Dr. Smith',
  })
  @Expose()
  veterinarian!: string;

  @ApiProperty({
    description: 'Appointment status',
    enum: PetAppointmentStatus,
    example: PetAppointmentStatus.SCHEDULED,
  })
  @Expose()
  status!: PetAppointmentStatus;

  @ApiProperty({
    description: 'Reason for appointment',
    example: 'Annual checkup',
  })
  @Expose()
  reason!: string;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  notes?: string;

  @ApiProperty({
    description: 'Diagnosis from the appointment',
    required: false,
  })
  @Expose()
  diagnosis?: string;

  @ApiProperty({
    description: 'Treatment provided',
    required: false,
  })
  @Expose()
  treatment?: string;

  @ApiProperty({
    description: 'Date created',
    type: Date,
  })
  @Expose()
  dateCreated!: Date;

  @ApiProperty({
    description: 'Date updated',
    type: Date,
  })
  @Expose()
  dateUpdated!: Date;

  @ApiProperty({
    description: 'Date deleted (soft delete)',
    type: Date,
    required: false,
    nullable: true,
  })
  @Expose()
  dateDeleted?: Date | null;

  @ApiProperty({
    description: 'Version for optimistic locking',
    example: 1,
  })
  @Expose()
  version!: number;
}

/**
 * Pet Appointment Create DTO
 * Used when creating a new appointment
 */
export class PetAppointmentCreateDto {
  @ApiProperty({
    description: 'Pet ID',
    example: 'pet-123',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  petId!: string;

  @ApiProperty({
    description: 'Appointment date and time',
    example: '2023-01-15T14:00:00.000Z',
    type: Date,
  })
  @Expose()
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  appointmentDate!: Date;

  @ApiProperty({
    description: 'Type of appointment',
    example: 'checkup',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  appointmentType!: string;

  @ApiProperty({
    description: 'Veterinarian name',
    example: 'Dr. Smith',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  veterinarian!: string;

  @ApiProperty({
    description: 'Reason for appointment',
    example: 'Annual checkup',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  reason!: string;

  @ApiProperty({
    description: 'Appointment status',
    enum: PetAppointmentStatus,
    example: PetAppointmentStatus.SCHEDULED,
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PetAppointmentStatus)
  status?: PetAppointmentStatus;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Diagnosis from the appointment',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiProperty({
    description: 'Treatment provided',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  treatment?: string;
}

/**
 * Pet Appointment Update DTO
 * Used when updating an existing appointment
 */
export class PetAppointmentUpdateDto {
  @ApiProperty({
    description: 'Appointment ID',
    example: 'appt-123',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiProperty({
    description: 'Appointment date and time',
    example: '2023-01-15T14:00:00.000Z',
    type: Date,
    required: false,
  })
  @Expose()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  appointmentDate?: Date;

  @ApiProperty({
    description: 'Type of appointment',
    example: 'checkup',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  appointmentType?: string;

  @ApiProperty({
    description: 'Veterinarian name',
    example: 'Dr. Smith',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  veterinarian?: string;

  @ApiProperty({
    description: 'Appointment status',
    enum: PetAppointmentStatus,
    example: PetAppointmentStatus.COMPLETED,
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PetAppointmentStatus)
  status?: PetAppointmentStatus;

  @ApiProperty({
    description: 'Reason for appointment',
    example: 'Annual checkup',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Diagnosis from the appointment',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiProperty({
    description: 'Treatment provided',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  treatment?: string;
}

/**
 * Pet Appointment Create Many DTO
 * For bulk appointment creation
 */
export class PetAppointmentCreateManyDto {
  @ApiProperty({
    type: [PetAppointmentCreateDto],
    description: 'Array of appointments to create',
  })
  @Type(() => PetAppointmentCreateDto)
  bulk!: PetAppointmentCreateDto[];
}

/**
 * Pet Appointment Paginated DTO
 * For paginated appointment responses
 */
export class PetAppointmentPaginatedDto extends CrudResponsePaginatedDto<PetAppointmentDto> {
  @ApiProperty({
    type: [PetAppointmentDto],
    description: 'Array of appointments',
  })
  @Expose()
  @Type(() => PetAppointmentDto)
  declare data: PetAppointmentDto[];
}
