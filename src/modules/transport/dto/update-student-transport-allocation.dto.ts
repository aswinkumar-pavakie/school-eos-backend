import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateStudentTransportAllocationDto {
  @IsOptional()
  @IsUUID()
  routeStopId?: string;

  @IsOptional()
  @IsIn(['PICKUP', 'DROP', 'BOTH'])
  direction?: string;

  @IsOptional()
  @IsString()
  feeSlab?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
