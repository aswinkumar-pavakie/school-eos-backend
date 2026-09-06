import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateMemberDto {
  @IsUUID()
  personId!: string;

  @IsIn(['STUDENT', 'STAFF'])
  memberType!: 'STUDENT' | 'STAFF';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBooksAllowed?: number;
}
