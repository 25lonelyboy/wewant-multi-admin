import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { requestIdMiddleware } from './../src/common/middleware/request-id.middleware.js';

describe('基架冒烟 (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 信封 + requestId 响应头', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as { code: number; data: { status: string } };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('透传上游 requestId', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'e2e-fixed-id')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('e2e-fixed-id');
  });

  it('未知路由 → 404 信封', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect(404);
    const body = res.body as { code: number; data: null };
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });
});
