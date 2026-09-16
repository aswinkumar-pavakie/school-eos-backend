import { ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';

// Batched counterpart to GET /users/:personId -- capped well above any real
// scope size (a Class Advisor's full section roster is in the low hundreds)
// while still bounding a single query's IN-list size.
const MAX_BATCH_SIZE = 500;

export class GetUsersBatchBodyDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @IsUUID(undefined, { each: true })
  personIds!: string[];
}
