import { IsInt, IsNumberString, IsOptional, Max, Min } from 'class-validator';

// Cursor pagination: `before` is the oldest message id already seen by the client
// (a message.id, bigint-as-string over the wire) -- omit for the newest page.
// Bounded page size, never an unbounded SELECT.
export class ListMessagesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsNumberString()
  before?: string;
}
