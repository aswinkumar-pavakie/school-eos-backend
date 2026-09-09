import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { DOCUMENTS_BUCKET } from '../documents/document-storage.util';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentDocumentRequestRepository } from './repositories/parent-document-request.repository';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

@Injectable()
export class ParentDocumentsService {
  constructor(
    private readonly requestRepo: ParentDocumentRequestRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  async list(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    return this.requestRepo.findForStudent(studentId);
  }

  async create(personId: string, studentId: string, dto: CreateDocumentRequestDto) {
    await this.assertGuardian(personId, studentId);
    const id = await this.requestRepo.create({
      studentId,
      requestedBy: personId,
      docType: dto.docType,
      reason: dto.reason,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'DOCUMENT_REQUEST_CREATED',
      objectType: 'document_request',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: { studentId, docType: dto.docType, reason: dto.reason },
    });
    return this.requestRepo.findById(id, studentId);
  }

  async getDownloadUrl(personId: string, studentId: string, requestId: string): Promise<string> {
    await this.assertGuardian(personId, studentId);
    const request = await this.requestRepo.findById(requestId, studentId);
    if (!request) throw new NotFoundException('Document request not found.');
    if (request.state !== 'APPROVED' || !request.documentObjectKey) {
      throw new NotFoundException('This document is not yet available for download.');
    }
    return this.storage.createSignedUrl(DOCUMENTS_BUCKET, request.documentObjectKey, SIGNED_URL_TTL_SECONDS);
  }
}
