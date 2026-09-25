import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/errors/http-exception.filter';
import { createValidationPipe } from '../src/common/validation/validation.pipe';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/auth/me (GET) without a token -> 401', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('/api/v1/auth/login (POST) with an unknown identifier -> 401 Invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'does-not-exist@sms.in', password: 'wrong-password' })
      .expect(401)
      .expect((res: request.Response) => {
        expect(res.body.message).toBe('Invalid credentials');
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      });
  });

  it('/api/v1/auth/login (POST) with a missing body -> 400 with unchanged message array plus additive fieldErrors/code', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({})
      .expect(400)
      .expect((res: request.Response) => {
        // Existing contract: message is still an array of class-validator's
        // own default strings -- byte-identical to before this change.
        expect(Array.isArray(res.body.message)).toBe(true);
        expect(res.body.message).toEqual(
          expect.arrayContaining([
            'identifier should not be empty',
            'password should not be empty',
          ]),
        );
        expect(res.body.error).toBe('Bad Request');
        expect(res.body.statusCode).toBe(400);
        // New, additive fields only.
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fieldErrors).toEqual(
          expect.arrayContaining([
            { field: 'identifier', message: 'Identifier is required.' },
            { field: 'password', message: 'Password is required.' },
          ]),
        );
      });
  });
});
