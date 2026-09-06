import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { LibraryConfigRepository } from './repositories/library-config.repository';

@Injectable()
export class LibraryConfigService {
  constructor(
    private readonly configRepo: LibraryConfigRepository,
    private readonly auditService: AuditService,
  ) {}

  get() {
    return this.configRepo.get();
  }

  async update(dto: UpdateConfigDto, actorPersonId: string) {
    const existing = await this.configRepo.get();
    const updated = await this.configRepo.update(dto, actorPersonId);
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_CONFIG_UPDATED',
      objectType: 'library_config',
      objectId: null,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
