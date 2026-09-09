import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// amount_paise is a Postgres bigint — carried as a numeric string end-to-end (see
// prisma/schema.prisma research notes) so it never round-trips through a JS number and
// risks losing precision above 2^53.
export class CreateApprovalRequestDto {
  @IsString()
  @IsNotEmpty()
  requestType!: string;

  @IsString()
  @IsNotEmpty()
  subjectObjectType!: string;

  @IsString()
  @IsNotEmpty()
  subjectObjectId!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'amountPaise must be a non-negative integer string',
  })
  amountPaise?: string;

  @IsOptional()
  @IsIn(['PENDING', 'RETROSPECTIVE_PENDING'])
  initialState?: 'PENDING' | 'RETROSPECTIVE_PENDING';
}
