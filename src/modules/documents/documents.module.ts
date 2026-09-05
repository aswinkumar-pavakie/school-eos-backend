// Documents & Certificates (Admin's scope, per workflow.md): retention-policy
// catalog + generic document metadata records. No `certificate`/`certificate_template`
// table exists in the schema -- a Transfer Certificate, Bonafide, etc. is just a
// `document` row with an appropriate category/docType, using this same mechanism.
// Actual file upload/storage is out of scope here -- `objectKey` is caller-supplied,
// pointing at wherever the file already lives. All tables already existed live in
// the DB -- pure application code.

import { Module } from '@nestjs/common';
import { DocumentRetentionPoliciesController } from './document-retention-policies.controller';
import { DocumentRetentionPoliciesService } from './document-retention-policies.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentRetentionPolicyRepository } from './repositories/document-retention-policy.repository';
import { DocumentRepository } from './repositories/document.repository';

@Module({
  controllers: [DocumentRetentionPoliciesController, DocumentsController],
  providers: [
    DocumentRetentionPoliciesService,
    DocumentsService,
    DocumentRetentionPolicyRepository,
    DocumentRepository,
  ],
})
export class DocumentsModule {}
