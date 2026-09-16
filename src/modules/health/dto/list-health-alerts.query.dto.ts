import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListHealthAlertsQueryDto {
  // Same @Type(() => String) + @Transform pattern as
  // transport-ops/dto/transport-alerts-query.dto.ts's own `acknowledged` flag
  // -- implicit boolean conversion would otherwise turn the literal string
  // "false" into `true` before @Transform ever saw it.
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  acknowledged?: boolean;
}
