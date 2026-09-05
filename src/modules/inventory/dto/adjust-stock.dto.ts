import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

// A correction to the recorded count (e.g. a physical stock-take found fewer/more
// than the system shows) -- sets quantity directly, unlike AddStockDto which only
// ever increases it. Reason is required since this overrides the recorded count.
export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
