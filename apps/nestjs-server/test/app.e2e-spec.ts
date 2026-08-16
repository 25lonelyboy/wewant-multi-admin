import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';

describe('AppModule (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) 返回统一信封', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as {
      code: number;
      message: string;
      data: { status: string; uptime: number };
    };

    expect(body).toMatchObject({
      code: 0,
      message: 'ok',
      data: { status: 'ok' }
    });
    expect(typeof body.data.uptime).toBe('number');
  });

  it('未知路径返回 404 信封', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-such-route')
      .expect(404);

    expect(res.body).toMatchObject({ code: 40400, data: null });
  });

  afterEach(async () => {
    await app.close();
  });
});
