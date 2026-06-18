import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';
import { ExceptionsFilter } from '@bitwild/rockets';
import { AppModule } from '../src/app.module';

/**
 * Contract of the zod-driven reminder resource (`reminderZodResource`,
 * registered in the REAL AppModule — this suite boots the same module
 * main.ts does).
 *
 * The reminder is the first pre-existing sample resource converted to
 * the zod layer, so this spec pins down everything the conversion must
 * preserve or provide:
 *
 * - `appointmentId` relation meta with an ENTITY-CLASS target: the
 *   generated entity carries the FK column + `@ManyToOne(Appointment)`,
 *   and the appointment side still eager-loads `reminders` through it.
 * - Generated `ReminderResponseDto` serves BOTH `/reminders` routes and
 *   the nested array inside `AppointmentResponseDto` ($ref, single
 *   component).
 * - `ReminderOwnerScopeHook` passes through `zodResource` untouched —
 *   reminders stay scoped to the owner's appointments.
 * - Read-only surface: only list/read are exposed.
 */
describe('zod reminder resource (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;
  let ownerToken: string;
  let strangerToken: string;
  let appointmentId: string;
  let reminderId: string;

  const REMINDER_SEND_AT = '2026-06-30T15:00:00.000Z';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    doc = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('zod-reminder')
          .setVersion('1.0')
          .addBearerAuth()
          .build(),
      ),
    );

    const owner = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'zod-reminder-owner@example.com',
        password: 'password123',
        name: 'Reminder Owner',
      })
      .expect(201);
    ownerToken = owner.body.accessToken as string;

    const stranger = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'zod-reminder-stranger@example.com',
        password: 'password123',
        name: 'Reminder Stranger',
      })
      .expect(201);
    strangerToken = stranger.body.accessToken as string;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function schemaOf(name: string): Record<string, unknown> {
    const schema: unknown = doc.components?.schemas?.[name];
    if (!isRecord(schema)) {
      throw new Error(`Schema "${name}" missing from document components`);
    }
    return schema;
  }

  describe('OpenAPI document', () => {
    it('exposes only the read-only routes', () => {
      expect(Object.keys(doc.paths['/reminders'] ?? {}).sort()).toEqual(['get']);
      expect(Object.keys(doc.paths['/reminders/{id}'] ?? {}).sort()).toEqual([
        'get',
      ]);
      expect(
        Object.keys(doc.paths).filter((p) => p.startsWith('/reminders')),
      ).toHaveLength(2);
    });

    it('generates ReminderResponseDto from the schema', () => {
      const schema = schemaOf('ReminderResponseDto');
      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          appointmentId: { type: 'string', format: 'uuid' },
          sendAt: { type: 'string', format: 'date-time' },
          sent: {
            type: 'boolean',
            default: false,
            description: 'Whether the reminder was dispatched',
          },
          dateCreated: { type: 'string', format: 'date-time' },
        },
      });
      expect(schema.required).toEqual([
        'id',
        'appointmentId',
        'sendAt',
        'dateCreated',
      ]);
    });

    it('AppointmentResponseDto nests the SAME generated component via $ref', () => {
      const properties = schemaOf('AppointmentResponseDto')
        .properties as Record<string, Record<string, unknown>>;
      expect(properties.reminders).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ReminderResponseDto' },
      });
    });

    it('field meta namespaces do not leak into the document', () => {
      const raw = JSON.stringify(schemaOf('ReminderResponseDto'));
      expect(raw).not.toContain('"db"');
      expect(raw).not.toContain('"dto"');
      expect(raw).not.toContain('"relation"');
    });
  });

  describe('runtime', () => {
    it('appointment create writes the reminder through the generated entity', async () => {
      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Rex', species: 'dog', age: 3, status: 'active' })
        .expect(201);

      const appointment = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          petId: pet.body.id as string,
          date: '2026-07-01T15:00:00.000Z',
          reminderSendAt: REMINDER_SEND_AT,
          notes: 'checkup',
        })
        .expect(201);
      appointmentId = appointment.body.id as string;

      // Nested projection through the generated DTO ($ref above).
      const nested = appointment.body.reminders as Array<
        Record<string, unknown>
      >;
      expect(nested).toHaveLength(1);
      expect(nested[0].appointmentId).toBe(appointmentId);
      expect(new Date(nested[0].sendAt as string).getTime()).toBe(
        new Date(REMINDER_SEND_AT).getTime(),
      );
      expect(nested[0].sent).toBe(false);
      reminderId = nested[0].id as string;
    });

    it('GET /reminders lists the row with the FK and no joined appointment object', async () => {
      const res = await request(app.getHttpServer())
        .get('/reminders')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const rows = res.body.data as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(reminderId);
      expect(rows[0].appointmentId).toBe(appointmentId);
      // The relation joins at the persistence level (`include: 'default'`)
      // but the response projection does not expose it.
      expect(rows[0]).not.toHaveProperty('appointment');
    });

    it('GET /reminders/:id reads through the generated response DTO', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.appointmentId).toBe(appointmentId);
      expect(new Date(res.body.sendAt as string).getTime()).toBe(
        new Date(REMINDER_SEND_AT).getTime(),
      );
      expect(res.body.sent).toBe(false);
      expect(res.body.dateCreated).toBeTruthy();
    });

    it('write operations are not exposed (read-only resource)', async () => {
      const post = await request(app.getHttpServer())
        .post('/reminders')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ appointmentId, sendAt: REMINDER_SEND_AT });
      expect([404, 405]).toContain(post.status);

      const patch = await request(app.getHttpServer())
        .patch(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sent: true });
      expect([404, 405]).toContain(patch.status);

      const del = await request(app.getHttpServer())
        .delete(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect([404, 405]).toContain(del.status);
    });

    it('owner-scope hook passes through: stranger sees nothing', async () => {
      const list = await request(app.getHttpServer())
        .get('/reminders')
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(200);
      expect(list.body.data).toEqual([]);

      await request(app.getHttpServer())
        .get(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/reminders').expect(401);
    });
  });
});
