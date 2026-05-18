import { Column, Entity, OneToMany } from 'typeorm';
import { CommonSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { PetEntityInterface, PetStatus } from './pet.interface';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { PetAppointmentEntity } from '../pet-appointment/pet-appointment.entity';

@Entity('pets')
export class PetEntity
  extends CommonSqliteEntity
  implements PetEntityInterface
{
  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  species!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  breed?: string;

  @Column({ type: 'int', nullable: false })
  age!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: PetStatus.ACTIVE,
    nullable: false,
  })
  status!: PetStatus;

  @Column({ type: 'varchar', length: 255, nullable: false })
  userId!: string;

  @OneToMany(() => PetVaccinationEntity, (vaccination) => vaccination.pet)
  vaccinations?: PetVaccinationEntity[];

  @OneToMany(() => PetAppointmentEntity, (appointment) => appointment.pet)
  appointments?: PetAppointmentEntity[];
}
