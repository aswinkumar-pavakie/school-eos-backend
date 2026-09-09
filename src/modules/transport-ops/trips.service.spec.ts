import { NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';

function buildService() {
  const tripsRepo = {
    findMany: jest.fn().mockResolvedValue({
      rows: [{ id: 'trip-1', state: 'COMPLETED' }],
      total: 1,
    }),
    findById: jest.fn().mockResolvedValue({ id: 'trip-1', state: 'COMPLETED' }),
    findAttendanceCounts: jest.fn().mockResolvedValue({
      expected: '32',
      boarded: '30',
      dropped: '28',
      notBoarded: '2',
      absent: '0',
    }),
    findBoardingTimeline: jest.fn().mockResolvedValue([]),
  } as any;
  const service = new TripsService(tripsRepo);
  return { service, tripsRepo };
}

describe('TripsService', () => {
  it('lists trips with page/limit converted to offset', async () => {
    const { service, tripsRepo } = buildService();
    const result = await service.list({ page: 2, limit: 10 } as any);
    expect(tripsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 10 }),
    );
    expect(result).toEqual({
      data: [{ id: 'trip-1', state: 'COMPLETED' }],
      meta: { page: 2, limit: 10, total: 1 },
    });
  });

  it('defaults page/limit when omitted', async () => {
    const { service, tripsRepo } = buildService();
    await service.list({} as any);
    expect(tripsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 }),
    );
  });

  it('passes filters through to the repository unchanged', async () => {
    const { service, tripsRepo } = buildService();
    await service.list({
      date: '2025-12-19',
      vehicleId: 'v-1',
      routeId: 'r-1',
      driverId: 'd-1',
      state: 'COMPLETED',
    } as any);
    expect(tripsRepo.findMany).toHaveBeenCalledWith({
      date: '2025-12-19',
      vehicleId: 'v-1',
      routeId: 'r-1',
      driverId: 'd-1',
      state: 'COMPLETED',
      limit: 25,
      offset: 0,
    });
  });

  it('returns trip + attendance counts + timeline for a real trip', async () => {
    const { service } = buildService();
    const result = await service.get('trip-1');
    expect(result.trip).toEqual({ id: 'trip-1', state: 'COMPLETED' });
    expect(result.attendance.expected).toBe('32');
    expect(result.timeline).toEqual([]);
  });

  it('404s for a trip that does not exist', async () => {
    const { service, tripsRepo } = buildService();
    tripsRepo.findById.mockResolvedValueOnce(null);
    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });
});
