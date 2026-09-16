import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListDisciplineIncidentsQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsIn(['OPEN', 'ACTIONED', 'ESCALATED', 'CLOSED'])
  state?: string;
}
