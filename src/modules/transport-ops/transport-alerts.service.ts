import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { TransportAlertsQueryDto } from './dto/transport-alerts-query.dto';
import { TransportAlertRepository } from './repositories/transport-alert.repository';

@Injectable()
export class TransportAlertsService {
  constructor(
    private readonly alertRepo: TransportAlertRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(query: TransportAlertsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.alertRepo.findMany({
      acknowledged: query.acknowledged,
      severity: query.severity,
      vehicleId: query.vehicleId,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async acknowledge(id: string, personId: string) {
    const existing = await this.alertRepo.findById(id);
    if (!existing) throw new NotFoundException('Alert not found.');
    if (existing.acknowledgedAt) {
      throw new ConflictException('This alert is already acknowledged.');
    }
    const updated = await this.alertRepo.acknowledge(id, personId);
    if (!updated) {
      // Lost a race with another acknowledge between the two reads above.
      throw new ConflictException('This alert is already acknowledged.');
    }
    await this.auditService.record({
      actorPersonId: personId,
      action: 'TRANSPORT_ALERT_ACKNOWLEDGED',
      objectType: 'transport_alert',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
