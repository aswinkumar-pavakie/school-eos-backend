import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateDocumentRetentionPolicyDto } from './dto/create-document-retention-policy.dto';
import { UpdateDocumentRetentionPolicyDto } from './dto/update-document-retention-policy.dto';
import { isUniqueViolation } from './pg-error.util';
import { DocumentRetentionPolicyRepository } from './repositories/document-retention-policy.repository';

@Injectable()
export class DocumentRetentionPoliciesService {
  constructor(
    private readonly retentionPolicyRepo: DocumentRetentionPolicyRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.retentionPolicyRepo.findMany();
  }

  async get(category: string) {
    const policy = await this.retentionPolicyRepo.findByCategory(category);
    if (!policy)
      throw new NotFoundException('Document retention policy not found');
    return policy;
  }

  /** Exactly one of "permanent" or "has a retention_years number" must hold -- the
   * DB enforces this as `is_permanent = (retention_years IS NULL)`. */
  private assertExclusivity(
    isPermanent: boolean | undefined,
    retentionYears: number | undefined,
  ): void {
    if (isPermanent === true && retentionYears !== undefined) {
      throw new BadRequestException(
        'A policy cannot both be permanent and have a retentionYears value.',
      );
    }
    if (isPermanent === false && retentionYears === undefined) {
      throw new BadRequestException(
        'retentionYears is required when isPermanent is false.',
      );
    }
  }

  async create(dto: CreateDocumentRetentionPolicyDto, actorPersonId: string) {
    this.assertExclusivity(dto.isPermanent, dto.retentionYears);
    try {
      const created = await this.retentionPolicyRepo.create({
        ...dto,
        isPermanent: dto.isPermanent ?? dto.retentionYears === undefined,
        retentionYears: dto.isPermanent ? null : dto.retentionYears,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'DOCUMENT_RETENTION_POLICY_CREATED',
        objectType: 'document_retention_policy',
        objectId: created.category,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A retention policy for this category already exists.',
        );
      }
      throw err;
    }
  }

  async update(
    category: string,
    dto: UpdateDocumentRetentionPolicyDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(category);
    const touchesPermanence =
      dto.isPermanent !== undefined || dto.retentionYears !== undefined;
    if (touchesPermanence) {
      this.assertExclusivity(dto.isPermanent, dto.retentionYears);
    }
    const updated = await this.retentionPolicyRepo.update(category, {
      ...dto,
      isPermanent: touchesPermanence
        ? (dto.isPermanent ?? dto.retentionYears === undefined)
        : undefined,
      retentionYears: touchesPermanence
        ? dto.isPermanent
          ? null
          : dto.retentionYears
        : undefined,
    });
    if (!updated)
      throw new NotFoundException('Document retention policy not found');
    await this.auditService.record({
      actorPersonId,
      action: 'DOCUMENT_RETENTION_POLICY_UPDATED',
      objectType: 'document_retention_policy',
      objectId: category,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
