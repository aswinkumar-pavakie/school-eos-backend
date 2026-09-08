import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StudentWalletRepository } from './repositories/student-wallet.repository';

@Injectable()
export class StudentWalletService {
  constructor(
    private readonly walletRepo: StudentWalletRepository,
    private readonly auditService: AuditService,
  ) {}

  async getForStudent(studentId: string) {
    return this.walletRepo.findByStudentId(studentId);
  }

  async freeze(studentId: string, reason: string, actorPersonId: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason is required to freeze a wallet.');
    }
    const wallet = await this.walletRepo.findByStudentId(studentId);
    if (!wallet)
      throw new NotFoundException('This student has no wallet on file.');
    if (wallet.status === 'CLOSED') {
      throw new BadRequestException(
        'This wallet is closed and cannot be frozen.',
      );
    }

    const updated = await this.walletRepo.freeze(
      wallet.id,
      reason.trim(),
      actorPersonId,
    );
    if (!updated) {
      throw new ConflictException('This wallet is already frozen.');
    }
    await this.auditService.record({
      actorPersonId,
      action: 'WALLET_FROZEN',
      objectType: 'wallet',
      objectId: updated.id,
      outcome: 'SUCCESS',
      beforeData: wallet,
      afterData: updated,
    });
    return updated;
  }

  async unfreeze(studentId: string, actorPersonId: string) {
    const wallet = await this.walletRepo.findByStudentId(studentId);
    if (!wallet)
      throw new NotFoundException('This student has no wallet on file.');

    const updated = await this.walletRepo.unfreeze(wallet.id);
    if (!updated) {
      throw new ConflictException('This wallet is not currently frozen.');
    }
    await this.auditService.record({
      actorPersonId,
      action: 'WALLET_UNFROZEN',
      objectType: 'wallet',
      objectId: updated.id,
      outcome: 'SUCCESS',
      beforeData: wallet,
      afterData: updated,
    });
    return updated;
  }
}
