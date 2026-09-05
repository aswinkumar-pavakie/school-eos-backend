import { IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ADMIN_REQUEST_TYPES } from '../admin-request-types';

export class CreateApprovalRequestDto {
  @IsIn(ADMIN_REQUEST_TYPES)
  requestType!: string;

  /** Who this request is on behalf of (e.g. the teacher who asked for an
   * attendance correction) -- defaults to the actor (Admin logging it
   * themselves) when omitted. */
  @IsOptional()
  @IsUUID()
  requestedByPersonId?: string;

  @IsOptional()
  @IsString()
  subjectObjectType?: string;

  @IsOptional()
  @IsString()
  subjectObjectId?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /** The requestType-specific "requested change/action" -- shape is validated
   * against that specific request type when the request is approved (see
   * RequestEffectsService), not here at creation time. */
  @IsOptional()
  @IsObject()
  actionPayload?: Record<string, unknown>;
}
