import { BoardingEventsService } from './boarding-events.service';

function buildService() {
  const boardingEventsRepo = {
    findMany: jest.fn().mockResolvedValue({
      rows: [{ id: '1', source: 'ATTENDANT_MANUAL' }],
      total: 1,
    }),
  } as any;
  const service = new BoardingEventsService(boardingEventsRepo);
  return { service, boardingEventsRepo };
}

describe('BoardingEventsService', () => {
  it('lists boarding events with page/limit converted to offset', async () => {
    const { service, boardingEventsRepo } = buildService();
    const result = await service.list({ page: 3, limit: 20 } as any);
    expect(boardingEventsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 40 }),
    );
    expect(result.meta).toEqual({ page: 3, limit: 20, total: 1 });
  });

  it('defaults page/limit when omitted', async () => {
    const { service, boardingEventsRepo } = buildService();
    await service.list({} as any);
    expect(boardingEventsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  // The one real distinction this screen must never blur: an event's actual
  // recorded source, never relabelled as NFC when the DB says manual.
  it('passes the real source filter through unchanged (never inventing a NFC-only vocabulary)', async () => {
    const { service, boardingEventsRepo } = buildService();
    await service.list({ source: 'ATTENDANT_MANUAL' } as any);
    expect(boardingEventsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ATTENDANT_MANUAL' }),
    );
  });
});
