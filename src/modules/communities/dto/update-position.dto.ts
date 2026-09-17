import { IsIn, IsUUID, MinLength, ValidateIf, IsString } from 'class-validator';

export class UpdatePositionDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsIn(['STAFF', 'STUDENT'])
  assigneeType!: 'STAFF' | 'STUDENT';

  @ValidateIf((o) => o.assigneeType === 'STAFF')
  @IsUUID()
  assigneeStaffId?: string;

  @ValidateIf((o) => o.assigneeType === 'STUDENT')
  @IsUUID()
  assigneeStudentId?: string;
}
