import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { TerminalRepository } from './repositories/terminal.repository';

@Injectable()
export class TerminalsService {
  constructor(
    private readonly terminalRepo: TerminalRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.terminalRepo.findMany();
  }

  async get(id: string) {
    const terminal = await this.terminalRepo.findById(id);
    if (!terminal) throw new NotFoundException('Terminal not found');
    return terminal;
  }

  /** The DB's own CHECK only requires the *matching* field per type (BUS needs
   * vehicleId, CANTEEN needs vendorId); it doesn't forbid the *other* field being set
   * too. Enforce the stricter, sensible reading here: GATE/LIBRARY must have neither,
   * BUS must not carry a vendorId, CANTEEN must not carry a vehicleId. */
  private assertBinding(dto: CreateTerminalDto): void {
    if (dto.terminalType === 'BUS' && dto.vendorId) {
      throw new BadRequestException('A BUS terminal cannot have a vendorId.');
    }
    if (dto.terminalType === 'CANTEEN' && dto.vehicleId) {
      throw new BadRequestException(
        'A CANTEEN terminal cannot have a vehicleId.',
      );
    }
    if (
      (dto.terminalType === 'GATE' || dto.terminalType === 'LIBRARY') &&
      (dto.vehicleId || dto.vendorId)
    ) {
      throw new BadRequestException(
        'A GATE or LIBRARY terminal cannot have a vehicleId or vendorId.',
      );
    }
  }

  async create(dto: CreateTerminalDto, actorPersonId: string) {
    this.assertBinding(dto);
    try {
      const created = await this.terminalRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'TERMINAL_CREATED',
        objectType: 'terminal',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A terminal with this terminalUid already exists.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'vehicleId or vendorId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateTerminalDto, actorPersonId: string) {
    const existing = await this.get(id);
    const updated = await this.terminalRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Terminal not found');
    await this.auditService.record({
      actorPersonId,
      action: 'TERMINAL_UPDATED',
      objectType: 'terminal',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
