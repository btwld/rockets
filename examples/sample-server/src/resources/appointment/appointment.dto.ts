import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { AppointmentStatus } from './appointment.entity';

@Exclude()
export class ReminderResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() appointmentId!: string;
  @Expose() @ApiProperty() sendAt!: Date;
  @Expose() @ApiProperty() sent!: boolean;
  @Expose() @ApiProperty() dateCreated!: Date;
}

@Exclude()
export class AppointmentDto {
  @Expose() @ApiProperty() id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  petId!: string;

  @Expose() @ApiProperty() userId!: string;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  date!: Date;

  @Expose()
  @ApiProperty({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @Expose() @ApiProperty() dateCreated!: Date;
}

export class AppointmentCreateDto extends PickType(AppointmentDto, [
  'petId',
  'date',
  'notes',
] as const) {
  @Expose()
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When to send the reminder (must be before `date`).',
  })
  @IsDateString()
  reminderSendAt!: Date;
}

export class AppointmentResponseDto extends AppointmentDto {
  @Expose()
  @IsArray()
  @Type(() => ReminderResponseDto)
  @ApiProperty({ type: [ReminderResponseDto], required: false })
  reminders?: ReminderResponseDto[];
}
