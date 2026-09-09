import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TransportAlertsQueryDto {
  // Deliberately `@Type(() => String)`, not `@Type(() => Boolean)` or bare
  // `enableImplicitConversion` (the global ValidationPipe default): with a
  // `boolean`-typed field, implicit conversion coerces the raw query string
  // via the `Boolean()` constructor BEFORE any @Transform runs -- so the
  // literal string "false" already becomes `true` (any non-empty string is
  // truthy) by the time a @Transform would see it, making "false" and "true"
  // indistinguishable. Declaring the incoming type as String bypasses that
  // implicit boolean coercion entirely, so @Transform below receives the
  // real, untouched "true"/"false" string and converts it correctly.
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  acknowledged?: boolean;

  @IsOptional()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
