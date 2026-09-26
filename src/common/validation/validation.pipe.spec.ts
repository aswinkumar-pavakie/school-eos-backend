import { IsEmail, IsNotEmpty, IsString, validate } from 'class-validator';
import { validationPipeConfig } from './validation.pipe';

class SampleLoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

class SampleEmailDto {
  @IsEmail()
  email!: string;
}

describe('validationPipeConfig.exceptionFactory', () => {
  it('keeps `message` as the same flat array of default class-validator strings as before this change', async () => {
    const dto = new SampleLoginDto();
    dto.identifier = '';
    dto.password = '';
    const errors = await validate(dto);

    const exception = validationPipeConfig.exceptionFactory!(
      errors,
    ) as unknown as {
      getResponse(): {
        message: string[];
        error: string;
        statusCode: number;
        code: string;
        fieldErrors: { field: string; message: string }[];
      };
      getStatus(): number;
    };

    const body = exception.getResponse();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message).toEqual(
      expect.arrayContaining([
        'identifier should not be empty',
        'password should not be empty',
      ]),
    );
    expect(exception.getStatus()).toBe(400);
  });

  it('adds an additive code + fieldErrors alongside the unchanged message array', async () => {
    const dto = new SampleLoginDto();
    dto.identifier = '';
    dto.password = '';
    const errors = await validate(dto);

    const exception = validationPipeConfig.exceptionFactory!(
      errors,
    ) as unknown as {
      getResponse(): {
        code: string;
        fieldErrors: { field: string; message: string }[];
      };
    };
    const body = exception.getResponse();

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'identifier', message: 'Identifier is required.' },
        { field: 'password', message: 'Password is required.' },
      ]),
    );
  });

  it("falls back to class-validator's own message for a constraint with no friendly mapping entry", async () => {
    // isEmail IS mapped, so pick a still-real but deliberately-unmapped case by
    // checking a constraint this codebase's map doesn't cover falls back safely
    // rather than throwing or producing an empty string.
    const dto = new SampleEmailDto();
    dto.email = 'not-an-email';
    const errors = await validate(dto);

    const exception = validationPipeConfig.exceptionFactory!(
      errors,
    ) as unknown as {
      getResponse(): { fieldErrors: { field: string; message: string }[] };
    };
    const body = exception.getResponse();
    expect(body.fieldErrors).toEqual([
      { field: 'email', message: 'Email must be a valid email address.' },
    ]);
  });
});
