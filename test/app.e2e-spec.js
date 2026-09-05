"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../src/app.module");
const http_exception_filter_1 = require("../src/common/errors/http-exception.filter");
const validation_pipe_1 = require("../src/common/validation/validation.pipe");
describe('AppModule (e2e)', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes((0, validation_pipe_1.createValidationPipe)());
        app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    it('/api/v1/auth/me (GET) without a token -> 401', () => {
        return (0, supertest_1.default)(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });
    it('/api/v1/auth/login (POST) with an unknown identifier -> 401 Invalid credentials', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ identifier: 'does-not-exist@sms.in', password: 'wrong-password' })
            .expect(401)
            .expect((res) => {
            expect(res.body.message).toBe('Invalid credentials');
        });
    });
});
//# sourceMappingURL=app.e2e-spec.js.map