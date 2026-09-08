import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  DOCUMENTS_BUCKET,
  documentObjectKeyFor,
} from './document-storage.util';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { DocumentRepository } from './repositories/document.repository';

// The bucket is private, so every fileUrl is a short-lived signed URL, minted
// fresh on each read -- never stored, since a document can be isRestricted and
// a stored/cached signed URL would outlive whatever access check produced it.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  /** A PURGED document's file is gone from Storage by design (see purge()
   * below) -- never worth a network round trip for it. And any other
   * unexpected Storage failure (object missing for some other reason, a
   * transient error) shouldn't take down the whole list/detail response over
   * one bad link -- best-effort, null on failure. */
  private async signedUrlFor(document: {
    status: string;
    objectKey: string;
  }): Promise<string | null> {
    if (document.status === 'PURGED') return null;
    try {
      return await this.storageService.createSignedUrl(
        DOCUMENTS_BUCKET,
        document.objectKey,
        SIGNED_URL_TTL_SECONDS,
      );
    } catch {
      return null;
    }
  }

  async list(query: DocumentQueryDto) {
    const rows = await this.documentRepo.findMany(query);
    return Promise.all(
      rows.map(async (d) => ({ ...d, fileUrl: await this.signedUrlFor(d) })),
    );
  }

  async get(id: string) {
    const document = await this.documentRepo.findById(id);
    if (!document) throw new NotFoundException('Document not found');
    return { ...document, fileUrl: await this.signedUrlFor(document) };
  }

  async create(dto: CreateDocumentDto, actor: AuthenticatedUser) {
    try {
      const created = await this.documentRepo.create({
        ...dto,
        uploadedBy: actor.personId,
      });
      await this.auditService.record({
        actorPersonId: actor.personId,
        action: 'DOCUMENT_CREATED',
        objectType: 'document',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A document with this objectKey already exists.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'category does not refer to an existing retention policy.',
        );
      }
      throw err;
    }
  }

  /** Combined "save the file and record it" path -- POST /documents (create,
   * above) stays metadata-only for a file that's already sitting somewhere else,
   * this one owns the actual bytes. */
  async upload(
    dto: UploadDocumentDto,
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ) {
    const objectKey = documentObjectKeyFor(file);
    await this.storageService.upload(
      DOCUMENTS_BUCKET,
      objectKey,
      file.buffer,
      file.mimetype,
    );
    try {
      const created = await this.documentRepo.create({
        ownerDomain: dto.ownerDomain,
        ownerObjectType: dto.ownerObjectType,
        ownerObjectId: dto.ownerObjectId,
        category: dto.category,
        docType: dto.docType,
        objectKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        isRestricted: dto.isRestricted === 'true',
        uploadedBy: actor.personId,
      });
      await this.auditService.record({
        actorPersonId: actor.personId,
        action: 'DOCUMENT_CREATED',
        objectType: 'document',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return { ...created, fileUrl: await this.signedUrlFor(created) };
    } catch (err) {
      await this.storageService.removeBestEffort(DOCUMENTS_BUCKET, objectKey);
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A document with this objectKey already exists.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'category does not refer to an existing retention policy.',
        );
      }
      throw err;
    }
  }

  /** "Purge" means gone -- the DB row is kept (status flips to PURGED, an audit
   * trail, never a hard row delete) but the actual file bytes are removed from
   * Storage here, otherwise a "deleted" document would sit in the bucket
   * forever with nothing left in the UI ever pointing back at it to clean up. */
  async purge(id: string, actorPersonId: string) {
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new NotFoundException('Document not found');
    if (existing.status === 'PURGED') {
      throw new ConflictException('This document is already purged.');
    }
    const updated = await this.documentRepo.purge(id);
    if (!updated) throw new NotFoundException('Document not found');
    await this.storageService.removeBestEffort(
      DOCUMENTS_BUCKET,
      updated.objectKey,
    );
    await this.auditService.record({
      actorPersonId,
      action: 'DOCUMENT_PURGED',
      objectType: 'document',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }
}
