import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ListPurchaseRequestsQueryDto {
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsIn(['GOODS', 'SERVICE'])
  requestType?: 'GOODS' | 'SERVICE';

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsIn(['GOODS', 'SERVICE'])
  requestType?: 'GOODS' | 'SERVICE';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class RequestTypeSummaryQueryDto {
  @IsIn(['GOODS', 'SERVICE'])
  requestType!: 'GOODS' | 'SERVICE';
}
