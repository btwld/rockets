process.env.FIREBASE_USE_FAKE = 'true';
process.env.GITHUB_USE_FAKE = 'true';
process.env.GITHUB_CLIENT_ID = 'e2e-client-id';
process.env.GITHUB_CLIENT_SECRET = 'e2e-client-secret';
process.env.GITHUB_OAUTH_CALLBACK_URL = 'http://localhost:3001/github/oauth/callback';
process.env.OPENAI_API_KEY = '';
process.env.OPEN_API_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import request from 'supertest';

import { ExceptionsFilter } from '@concepta/rockets';

const FIREBASE_USER = 'Bearer fb-user-token';

interface ReportExecutionView {
  readonly reviewEngine?: string;
}

interface ReportScoreView {
  readonly section: string;
  readonly score: number;
  readonly summary: string;
}

interface ReportListRow {
  readonly id: string;
  readonly fullName: string;
  readonly persistence?: {
    readonly reportDocument?: string;
    readonly executionRecord?: string;
  };
  readonly execution?: ReportExecutionView;
  readonly scorecard?: ReportScoreView[];
}

interface ReportDetailView extends ReportListRow {
  readonly status: string;
  readonly findings: unknown[];
  readonly documentPath?: string;
  readonly summary: string;
  readonly execution?: {
    readonly githubLogin?: string;
    readonly reviewEngine?: string;
    readonly reviewModel?: string | null;
    readonly defaultBranch?: string;
    readonly repositoryLanguage?: string | null;
    readonly sourceFilesCount?: number;
    readonly sourceFilesTruncated?: boolean;
    readonly durationMs?: number | null;
  };
}

async function waitForTerminalReport(
  app: INestApplication,
  reportId: string,
): Promise<ReportDetailView> {
  let completed = {} as ReportDetailView;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const poll = await request(app.getHttpServer())
      .get(`/analysis/reports/${reportId}`)
      .set('Authorization', FIREBASE_USER)
      .expect(200);
    completed = poll.body as ReportDetailView;
    if (
      completed.status === 'completed' ||
      completed.status === 'failed'
    ) {
      return completed;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return completed;
}

describe('sample-code-review — Firebase + GitHub + analysis (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Dynamic ON PURPOSE: src/app.module.ts reads FIREBASE_USE_FAKE at
    // MODULE SCOPE (line ~20), and under ESM semantics a static import
    // would evaluate it before this file's process.env assignments above.
    // Deferring the import to beforeAll guarantees fake mode is set first.
    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('rejects unauthenticated access to GitHub routes', async () => {
    await request(app.getHttpServer()).get('/github/repos').expect(401);
  });

  it('runs the full reviewer flow for the Firebase user', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe('firebase-user');
      });

    await request(app.getHttpServer())
      .post('/github/connect')
      .set('Authorization', FIREBASE_USER)
      .send({ code: 'demo-github-code' })
      .expect(200)
      .expect((res) => {
        expect(res.body.githubLogin).toBe('demo-reviewer');
        expect(res.body.connected).toBe(true);
      });

    const repos = await request(app.getHttpServer())
      .get('/github/repos')
      .set('Authorization', FIREBASE_USER)
      .expect(200);

    expect(
      repos.body.some((r: { fullName: string }) => r.fullName === 'conceptadev/rockets'),
    ).toBe(true);

    // Per-route Standard Schema pipe (no global pipe): the Rockets
    // envelope names the offending field.
    const invalid = await request(app.getHttpServer())
      .post('/analysis/review')
      .set('Authorization', FIREBASE_USER)
      .send({ owner: '', repo: 'rockets' })
      .expect(400);
    expect(invalid.body.errorCode).toBeTruthy();
    expect(JSON.stringify(invalid.body.message)).toContain('owner');

    const review = await request(app.getHttpServer())
      .post('/analysis/review')
      .set('Authorization', FIREBASE_USER)
      .send({ owner: 'conceptadev', repo: 'rockets' })
      .expect(202);

    expect(review.body.fullName).toBe('conceptadev/rockets');
    expect(['queued', 'fetching', 'analyzing']).toContain(review.body.status);

    const reportId = review.body.id as string;
    const completed = await waitForTerminalReport(app, reportId);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const secondReview = await request(app.getHttpServer())
      .post('/analysis/review')
      .set('Authorization', FIREBASE_USER)
      .send({ owner: 'conceptadev', repo: 'rockets' })
      .expect(202);
    const secondReportId = secondReview.body.id as string;
    const secondCompleted = await waitForTerminalReport(app, secondReportId);

    expect(completed.status).toBe('completed');
    expect(completed.findings.length).toBeGreaterThan(0);
    expect(completed.documentPath).toMatch(/^code_review_reports\//);
    expect(completed.summary).toContain('overall');
    expect(completed.scorecard).toHaveLength(5);
    expect(completed.scorecard?.some((item) => item.section === 'architecture')).toBe(
      true,
    );
    expect(completed.persistence).toMatchObject({
      reportDocument: 'firebase-firestore',
      executionRecord: 'sqlite-typeorm',
    });
    const execution = completed.execution;

    expect(execution).toMatchObject({
      githubLogin: 'demo-reviewer',
      reviewEngine: 'heuristic',
      reviewModel: null,
      defaultBranch: 'main',
      repositoryLanguage: 'TypeScript',
      sourceFilesCount: 2,
      sourceFilesTruncated: false,
    });
    expect(execution).toBeDefined();
    expect(typeof execution?.durationMs).toBe('number');
    expect(secondCompleted.status).toBe('completed');

    const list = await request(app.getHttpServer())
      .get('/analysis/reports')
      .set('Authorization', FIREBASE_USER)
      .expect(200);

    expect(list.body.length).toBeGreaterThanOrEqual(1);
    expect(list.body[0].execution).toMatchObject({
      githubLogin: 'demo-reviewer',
      reviewEngine: 'heuristic',
      defaultBranch: 'main',
      sourceFilesCount: 2,
    });
    expect((list.body[0] as ReportListRow).persistence).toMatchObject({
      reportDocument: 'firebase-firestore',
      executionRecord: 'sqlite-typeorm',
    });
    expect((list.body[0] as ReportListRow).scorecard).toHaveLength(5);
    expect((list.body[0] as ReportListRow).id).toBe(secondReportId);
    expect((list.body[1] as ReportListRow).id).toBe(reportId);

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ github: 'conceptadev/rockets' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].fullName).toBe('conceptadev/rockets');
      });

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ github: 'no-such-org/repo' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual([]);
      });

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ status: 'completed', q: 'rockets' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ reviewEngine: 'heuristic' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBeGreaterThanOrEqual(2);
        expect(
          (res.body as ReportListRow[]).every(
            (row) => row.execution?.reviewEngine === 'heuristic',
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ sortBy: 'dateCreated', sortOrder: 'asc' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect((res.body[0] as ReportListRow).id).toBe(reportId);
        expect((res.body[1] as ReportListRow).id).toBe(secondReportId);
      });

    await request(app.getHttpServer())
      .get('/analysis/reports')
      .query({ sortBy: 'executionDateCreated', sortOrder: 'asc' })
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect((res.body[0] as ReportListRow).id).toBe(reportId);
        expect((res.body[1] as ReportListRow).id).toBe(secondReportId);
      });

    await request(app.getHttpServer())
      .get(`/analysis/reports/${reportId}`)
      .set('Authorization', FIREBASE_USER)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(reportId);
        expect(res.body.scorecard).toHaveLength(5);
        expect(res.body.persistence).toMatchObject({
          reportDocument: 'firebase-firestore',
          executionRecord: 'sqlite-typeorm',
        });
        expect(res.body.execution).toMatchObject({
          githubLogin: 'demo-reviewer',
          reviewEngine: 'heuristic',
        });
      });
  });
});
