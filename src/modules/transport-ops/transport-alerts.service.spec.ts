import { ConflictException, NotFoundException } from '@nestjs/common';
import { TransportAlertsService } from './transport-alerts.service';

function buildService(opts: { existing?: any } = {}) {
  const existing = opts.existing ?? {
    id: '1',
    alertType: 'GPS_STALE',
    acknowledgedAt: null,
    acknowledgedBy: null,
  };
  const alertRepo = {
    findMany: jest.fn().mockResolvedValue({ rows: [existing], total: 1 }),
    findById: jest.fn().mockResolvedValue(existing),
    acknowledge: jest.fn().mockImplementation((id: string, personId: string) =>
      Promise.resolve({
        ...existing,
        acknowledgedAt: new Date(),
        acknowledgedBy: personId,
      }),
    ),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const service = new TransportAlertsService(alertRepo, auditService);
  return { service, alertRepo, auditService };
}

describe('TransportAlertsService', () => {
  it('lists alerts with page/limit converted to offset', async () => {
    const { service, alertRepo } = buildService();
    await service.list({ page: 1, limit: 10 } as any);
    expect(alertRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
  });

  it('acknowledges an unacknowledged alert and audits it with the real actor', async () => {
    const { service, alertRepo, auditService } = buildService();
    const result = await service.acknowledge('1', 'person-1');
    expect(alertRepo.acknowledge).toHaveBeenCalledWith('1', 'person-1');
    expect(result.acknowledgedBy).toBe('person-1');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPersonId: 'person-1',
        action: 'TRANSPORT_ALERT_ACKNOWLEDGED',
        outcome: 'SUCCESS',
      }),
    );
  });

  it('404s acknowledging an alert that does not exist', async () => {
    const { service, alertRepo } = buildService();
    alertRepo.findById.mockResolvedValueOnce(null);
    await expect(service.acknowledge('missing', 'person-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects acknowledging an already-acknowledged alert', async () => {
    const { service } = buildService({
      existing: {
        id: '1',
        acknowledgedAt: new Date(),
        acknowledgedBy: 'someone-else',
      },
    });
    await expect(service.acknowledge('1', 'person-1')).rejects.toThrow(
      ConflictException,
    );
  });
});
