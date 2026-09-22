// Canteen counter's own service -- see canteen.repository.ts's own header
// comment for why chargeWallet needs a transaction (idempotency check +
// row locks + debit + stock decrement + both ledger inserts must be
// atomic against a retried or near-simultaneous charge, or two vendors
// selling the last unit of the same product at once). A real, permanent
// audit trail is written for every charge attempt -- successful, replayed,
// AND failed -- matching this codebase's own established rule for every
// money-mutating action (see expenses.service.ts and the rest of the
// Finance module: "an action that changed state but left no audit row is
// treated as a bug"). A failed attempt's audit row is written OUTSIDE the
// rolled-back transaction (on the plain pool, not the dead client)
// specifically so the trail survives even though the wallet/inventory were
// never touched -- otherwise a string of insufficient-balance,
// out-of-stock, or frozen-wallet attempts (real signals worth reviewing)
// would leave no trace at all.
//
// Product CRUD (the "heart" of this login, per its own explicit
// requirement) writes are each their own small unit -- no multi-table
// invariant to protect there the way charge() has -- but every mutating
// call still writes a real audit row, same posture as the rest of this
// module.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ChargeWalletDto } from './dto/charge-wallet.dto';
import { CreateCanteenProductDto } from './dto/create-canteen-product.dto';
import { UpdateCanteenProductDto } from './dto/update-canteen-product.dto';
import {
  CANTEEN_PRODUCTS_BUCKET,
  productImageObjectKeyFor,
} from './canteen-product-storage.util';
import {
  CanteenHistoryRow,
  CanteenRepository,
  CanteenTransactionItemRow,
} from './repositories/canteen.repository';

export interface CanteenActorContext {
  personId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function fullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

const FAILURE_MESSAGES: Record<string, string> = {
  STUDENT_NOT_FOUND: 'Student not found.',
  WALLET_NOT_FOUND: 'This student has no canteen wallet set up.',
  WALLET_FROZEN: 'This student’s wallet is frozen and cannot be charged.',
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance for this amount.',
  PRODUCT_NOT_FOUND: 'One of the selected products no longer exists.',
  OVERRIDE_EXCEEDS_ITEMS_TOTAL: 'The charged amount can’t be more than the items actually add up to.',
};

const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class CanteenService {
  constructor(
    private readonly repo: CanteenRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async searchStudents(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const rows = await this.repo.searchStudents(trimmed);
    return rows.map((r) => ({
      id: r.id,
      name: fullName(r.firstName, r.lastName),
      admissionNo: r.admissionNo,
      gradeName: r.gradeName,
      sectionName: r.sectionName,
      hasWallet: r.walletId !== null,
      walletActive: r.walletStatus === 'ACTIVE',
      balancePaise: r.balancePaise !== null ? Number(r.balancePaise) : null,
    }));
  }

  // ============================================================
  // Inventory CRUD
  // ============================================================

  async listProducts(includeInactive: boolean) {
    const rows = await this.repo.listProducts(includeInactive);
    return rows.map(mapProductRow);
  }

  async createProduct(
    dto: CreateCanteenProductDto,
    file: Express.Multer.File | undefined,
    actor: CanteenActorContext,
  ) {
    const imageObjectKey = file
      ? productImageObjectKeyFor(file)
      : null;
    if (file && imageObjectKey) {
      await this.storage.upload(
        CANTEEN_PRODUCTS_BUCKET,
        imageObjectKey,
        file.buffer,
        file.mimetype,
      );
    }
    const created = await this.repo.createProduct({
      name: dto.name.trim(),
      quantity: dto.quantity,
      pricePerUnitPaise: dto.pricePerUnitPaise,
      imageObjectKey,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'CANTEEN_VENDOR',
      action: 'CANTEEN_PRODUCT_CREATED',
      objectType: 'canteen_product',
      objectId: created.id,
      outcome: 'SUCCESS',
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      afterData: created,
    });
    return mapProductRow(created);
  }

  async updateProduct(
    id: string,
    dto: UpdateCanteenProductDto,
    file: Express.Multer.File | undefined,
    actor: CanteenActorContext,
  ) {
    const existing = await this.repo.getProductById(id);
    if (!existing) throw new NotFoundException('Product not found.');

    let imageObjectKey: string | null | undefined;
    if (file) {
      imageObjectKey = productImageObjectKeyFor(file);
      await this.storage.upload(
        CANTEEN_PRODUCTS_BUCKET,
        imageObjectKey,
        file.buffer,
        file.mimetype,
      );
    } else if (dto.removeImage) {
      imageObjectKey = null;
    }

    const updated = await this.repo.updateProduct(id, {
      name: dto.name?.trim(),
      quantity: dto.quantity,
      pricePerUnitPaise: dto.pricePerUnitPaise,
      isActive: dto.isActive,
      imageObjectKey,
    });

    // Replace/clear only after the new row is safely written -- never
    // delete the old object first (a failed write would otherwise leave
    // the product with no image at all).
    if (
      (imageObjectKey !== undefined) &&
      existing.imageObjectKey &&
      existing.imageObjectKey !== imageObjectKey
    ) {
      await this.storage.removeBestEffort(
        CANTEEN_PRODUCTS_BUCKET,
        existing.imageObjectKey,
      );
    }

    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'CANTEEN_VENDOR',
      action: 'CANTEEN_PRODUCT_UPDATED',
      objectType: 'canteen_product',
      objectId: id,
      outcome: 'SUCCESS',
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      beforeData: existing,
      afterData: updated,
    });
    return mapProductRow(updated!);
  }

  async deleteProduct(id: string, actor: CanteenActorContext) {
    const existing = await this.repo.getProductById(id);
    if (!existing) throw new NotFoundException('Product not found.');
    await this.repo.deleteProduct(id);
    if (existing.imageObjectKey) {
      await this.storage.removeBestEffort(
        CANTEEN_PRODUCTS_BUCKET,
        existing.imageObjectKey,
      );
    }
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'CANTEEN_VENDOR',
      action: 'CANTEEN_PRODUCT_DELETED',
      objectType: 'canteen_product',
      objectId: id,
      outcome: 'SUCCESS',
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      beforeData: existing,
    });
  }

  // ============================================================
  // Charging a wallet -- a real multi-product sale.
  // ============================================================

  async charge(dto: ChargeWalletDto, actor: CanteenActorContext) {
    try {
      return await this.uow.run(async (client) => {
        // Re-checked here, inside this exact transaction, right before the
        // debit -- not trusted from an earlier, separate lookup -- so a
        // student who went inactive between being searched and being
        // charged can't slip a charge through a stale check.
        const student = await this.repo.getStudentBasicInfo(
          dto.studentId,
          client,
        );
        if (!student) throw new Error('STUDENT_NOT_FOUND');

        const result = await this.repo.chargeWallet(
          {
            studentId: dto.studentId,
            items: dto.items,
            amountOverridePaise: dto.amountOverridePaise ?? null,
            performedBy: actor.personId,
            idempotencyKey: dto.idempotencyKey,
          },
          client,
        );

        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'CANTEEN_VENDOR',
            action: result.replayed
              ? 'CANTEEN_WALLET_CHARGE_REPLAYED'
              : 'CANTEEN_WALLET_CHARGED',
            objectType: 'canteen_transaction',
            objectId: result.transactionId,
            outcome: 'SUCCESS',
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            correlationId: dto.idempotencyKey,
            afterData: {
              studentId: dto.studentId,
              admissionNo: student.admissionNo,
              items: dto.items,
              itemsTotalPaise: result.itemsTotalPaise,
              amountPaise: result.amountPaise,
              balanceAfterPaise: result.balanceAfterPaise,
            },
          },
          client,
        );

        return {
          transactionId: result.transactionId,
          studentId: student.id,
          studentName: fullName(student.firstName, student.lastName),
          admissionNo: student.admissionNo,
          amountPaise: Number(result.amountPaise),
          itemsTotalPaise: Number(result.itemsTotalPaise),
          balanceAfterPaise: Number(result.balanceAfterPaise),
          createdAt: result.createdAt,
        };
      });
    } catch (err) {
      const rawReason = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const [reason] = rawReason.split(':');
      const httpMessage =
        reason === 'INSUFFICIENT_STOCK'
          ? `Not enough stock of ${rawReason.split(':')[1] ?? 'that product'}.`
          : FAILURE_MESSAGES[reason];

      // Never let an audit-write failure hide the real error from the
      // caller -- best-effort, swallowed on its own.
      await this.audit
        .record({
          actorPersonId: actor.personId,
          actorRoleCode: 'CANTEEN_VENDOR',
          action: 'CANTEEN_WALLET_CHARGE_FAILED',
          objectType: 'canteen_transaction',
          objectId: null,
          outcome: 'DENIED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          correlationId: dto.idempotencyKey,
          afterData: {
            studentId: dto.studentId,
            items: dto.items,
            reason: httpMessage ? rawReason : 'UNEXPECTED_ERROR',
          },
        })
        .catch(() => {});

      if (reason === 'STUDENT_NOT_FOUND' || reason === 'WALLET_NOT_FOUND' || reason === 'PRODUCT_NOT_FOUND') {
        throw new NotFoundException(httpMessage);
      }
      if (
        reason === 'WALLET_FROZEN' ||
        reason === 'INSUFFICIENT_BALANCE' ||
        reason === 'INSUFFICIENT_STOCK' ||
        reason === 'OVERRIDE_EXCEEDS_ITEMS_TOTAL'
      ) {
        throw new BadRequestException(httpMessage);
      }
      throw err;
    }
  }

  async listHistory(limit: number, offset: number) {
    const rows = await this.repo.listHistory(limit, offset);
    const items = await this.repo.listItemsForTransactions(rows.map((r) => r.id));
    return rows.map((r) => mapHistoryRow(r, items));
  }

  /** Every number here is a real aggregate off canteen_transaction (and,
   * for declinedToday, the same audit_event rows every failed charge
   * writes -- see charge()'s own header comment) as of the moment this is
   * called -- nothing cached, nothing estimated. See
   * canteen.repository.ts's own getWeeklySalesTrend/getTodayHourlySales
   * comments for why both series are always a fixed length (7 days / 13
   * hours) with real zeros, not sparse.
   *
   * Additions beyond the raw totals, each answering a real question a
   * counter vendor actually has, not just "more charts": salesDeltaPct/
   * transactionsDeltaPct (is today better or worse than yesterday), peakHour
   * (straight off the hourly series already being fetched), gradeBreakdown/
   * declinedToday (what to stock, and how many students tried to buy and
   * couldn't), and now lowStockCount/inventoryValue -- the two real
   * inventory signals a vendor needs at a glance without opening the
   * Inventory tab. */
  async getDashboard() {
    const [
      today,
      yesterday,
      weeklyRows,
      hourlyRows,
      gradeRows,
      declinedToday,
      recentRows,
      lowStock,
      inventoryValuation,
    ] = await Promise.all([
      this.repo.getDaySummary(0),
      this.repo.getDaySummary(1),
      this.repo.getWeeklySalesTrend(),
      this.repo.getTodayHourlySales(),
      this.repo.getGradeBreakdownToday(),
      this.repo.getDeclinedCountToday(),
      this.repo.listHistory(8, 0),
      this.repo.getLowStockProducts(LOW_STOCK_THRESHOLD),
      this.repo.getInventoryValuation(),
    ]);

    const todaySalesPaise = Number(today.salesPaise);
    const todayTransactionCount = today.transactionCount;
    const yesterdaySalesPaise = Number(yesterday.salesPaise);
    const yesterdayTransactionCount = yesterday.transactionCount;

    const hourlyToday = hourlyRows.map((r) => ({
      hour: r.hour,
      totalPaise: Number(r.totalPaise),
    }));
    const peak = hourlyToday.reduce(
      (best, r) => (r.totalPaise > best.totalPaise ? r : best),
      hourlyToday[0],
    );

    const gradeTotals = gradeRows.map((r) => ({
      gradeName: r.gradeName ?? 'Unassigned',
      totalPaise: Number(r.totalPaise),
    }));
    const TOP_GRADES = 5;
    const gradeBreakdown = gradeTotals.slice(0, TOP_GRADES);
    const otherGrades = gradeTotals.slice(TOP_GRADES);
    if (otherGrades.length > 0) {
      gradeBreakdown.push({
        gradeName: 'Other',
        totalPaise: otherGrades.reduce((sum, g) => sum + g.totalPaise, 0),
      });
    }

    const recentItems = await this.repo.listItemsForTransactions(
      recentRows.map((r) => r.id),
    );

    return {
      todaySalesPaise,
      todayTransactionCount,
      todayUniqueStudents: today.uniqueStudents,
      todayAvgTransactionPaise:
        todayTransactionCount > 0
          ? Math.round(todaySalesPaise / todayTransactionCount)
          : 0,
      salesDeltaPct: percentDelta(todaySalesPaise, yesterdaySalesPaise),
      transactionsDeltaPct: percentDelta(
        todayTransactionCount,
        yesterdayTransactionCount,
      ),
      peakHour: peak && peak.totalPaise > 0 ? peak.hour : null,
      declinedToday,
      weeklyTrend: weeklyRows.map((r) => ({
        date: r.day,
        totalPaise: Number(r.totalPaise),
      })),
      hourlyToday,
      gradeBreakdown,
      recentTransactions: recentRows.map((r) => mapHistoryRow(r, recentItems)),
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock,
      inventoryUnits: inventoryValuation.totalUnits,
      inventoryValuePaise: Number(inventoryValuation.totalValuePaise),
      inventoryProductCount: inventoryValuation.productCount,
    };
  }

  /** Everything a canteen vendor needs to review its own business over a
   * period, plus the two always-live inventory snapshots (valuation, low
   * stock) that don't depend on the date range at all. */
  async getReports(fromDate: string, toDate: string) {
    const [
      summary,
      dailyTrend,
      gradeBreakdown,
      topProducts,
      declinedCount,
      lowStock,
      inventoryValuation,
    ] = await Promise.all([
      this.repo.getRangeSummary(fromDate, toDate),
      this.repo.getDailyTrendForRange(fromDate, toDate),
      this.repo.getGradeBreakdownForRange(fromDate, toDate),
      this.repo.getTopProductsForRange(fromDate, toDate, 10),
      this.repo.getDeclinedCountForRange(fromDate, toDate),
      this.repo.getLowStockProducts(LOW_STOCK_THRESHOLD),
      this.repo.getInventoryValuation(),
    ]);

    const salesPaise = Number(summary.salesPaise);
    const transactionCount = summary.transactionCount;

    return {
      range: { from: fromDate, to: toDate },
      salesPaise,
      transactionCount,
      uniqueStudents: summary.uniqueStudents,
      avgTransactionPaise:
        transactionCount > 0 ? Math.round(salesPaise / transactionCount) : 0,
      declinedCount,
      dailyTrend: dailyTrend.map((r) => ({
        date: r.day,
        totalPaise: Number(r.totalPaise),
        transactionCount: r.transactionCount,
      })),
      gradeBreakdown: gradeBreakdown.map((r) => ({
        gradeName: r.gradeName ?? 'Unassigned',
        totalPaise: Number(r.totalPaise),
      })),
      topProducts: topProducts.map((r) => ({
        productName: r.productName,
        quantitySold: r.quantitySold,
        revenuePaise: Number(r.revenuePaise),
      })),
      lowStockProducts: lowStock,
      inventory: {
        productCount: inventoryValuation.productCount,
        totalUnits: inventoryValuation.totalUnits,
        totalValuePaise: Number(inventoryValuation.totalValuePaise),
      },
    };
  }
}

/** null when yesterday's figure was 0 -- "infinite % increase" is not a
 * real number to show a vendor, so the frontend shows "new" instead of a
 * delta in that case. */
function percentDelta(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function mapProductRow(r: {
  id: string;
  name: string;
  imageObjectKey: string | null;
  imageUrl: string | null;
  quantity: number;
  pricePerUnitPaise: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    name: r.name,
    imageUrl: r.imageUrl,
    quantity: r.quantity,
    pricePerUnitPaise: Number(r.pricePerUnitPaise),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapHistoryRow(r: CanteenHistoryRow, allItems: CanteenTransactionItemRow[]) {
  return {
    id: r.id,
    studentId: r.studentId,
    studentName: fullName(r.firstName, r.lastName),
    admissionNo: r.admissionNo,
    gradeName: r.gradeName,
    sectionName: r.sectionName,
    amountPaise: Number(r.amountPaise),
    itemsTotalPaise: r.itemsTotalPaise !== null ? Number(r.itemsTotalPaise) : Number(r.amountPaise),
    balanceAfterPaise: Number(r.balanceAfterPaise),
    createdAt: r.createdAt,
    performedByName:
      r.performedByFirstName !== null
        ? fullName(r.performedByFirstName, r.performedByLastName)
        : null,
    items: allItems
      .filter((i) => i.transactionId === r.id)
      .map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPricePaise: Number(i.unitPricePaise),
        lineTotalPaise: Number(i.lineTotalPaise),
      })),
  };
}
