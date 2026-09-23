// The Canteen counter login's whole surface: full inventory CRUD, search
// for a student (the manual stand-in for an NFC card tap -- no reader is
// wired up yet, see canteen.repository.ts's own header comment), charge
// their wallet for a real multi-product sale, browse the sale history, and
// pull date-ranged reports. CANTEEN_VENDOR only -- this role's entire
// purpose is this one counter + stockroom workflow (see role.repository.ts's
// ROLE_MODULE_ACCESS: ['Finance & Fees (device, wallet sales only)']), same
// least-privilege precedent as BUS_ATTENDANT's own device-only scope.
//
// `charge` additionally carries CanteenRateLimitGuard (a real device
// credential moving real money should never be able to fire unboundedly
// fast) and captures IP/user-agent for the audit trail CanteenService
// writes on every attempt, same device-context pattern
// identity.controller.ts's own login endpoint already uses.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CanteenRateLimitGuard } from './canteen-rate-limit.guard';
import { CanteenService } from './canteen.service';
import { productImageMulterOptions } from './canteen-product-storage.util';
import { CanteenReportsQueryDto } from './dto/canteen-reports-query.dto';
import { ChargeWalletDto } from './dto/charge-wallet.dto';
import { CreateCanteenProductDto } from './dto/create-canteen-product.dto';
import { UpdateCanteenProductDto } from './dto/update-canteen-product.dto';

function deviceContextFrom(req: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: Array.isArray(userAgent)
      ? (userAgent[0] ?? null)
      : (userAgent ?? null),
  };
}

@Roles('CANTEEN_VENDOR')
@Controller('canteen')
export class CanteenController {
  constructor(private readonly service: CanteenService) {}

  @Get('students/search')
  async search(@Query('query') query?: string) {
    return { data: await this.service.searchStudents(query ?? '') };
  }

  @Get('dashboard')
  async dashboard() {
    return { data: await this.service.getDashboard() };
  }

  // ---- Inventory CRUD ----

  @Get('products')
  async listProducts(@Query('includeInactive') includeInactive?: string) {
    return {
      data: await this.service.listProducts(includeInactive === 'true'),
    };
  }

  @Post('products')
  @UseInterceptors(FileInterceptor('image', productImageMulterOptions))
  async createProduct(
    @Body() dto: CreateCanteenProductDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.createProduct(dto, file, {
        personId: actor.personId,
        ...deviceContextFrom(req),
      }),
    };
  }

  @Patch('products/:id')
  @UseInterceptors(FileInterceptor('image', productImageMulterOptions))
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCanteenProductDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.updateProduct(id, dto, file, {
        personId: actor.personId,
        ...deviceContextFrom(req),
      }),
    };
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.service.deleteProduct(id, {
      personId: actor.personId,
      ...deviceContextFrom(req),
    });
  }

  // ---- Selling ----

  @Post('charge')
  @UseGuards(CanteenRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async charge(
    @Body() dto: ChargeWalletDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.charge(dto, {
        personId: actor.personId,
        ...deviceContextFrom(req),
      }),
    };
  }

  @Get('history')
  async history(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '30', 10) || 30, 1),
      100,
    );
    const parsedOffset = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return { data: await this.service.listHistory(parsedLimit, parsedOffset) };
  }

  // ---- Reports ----

  @Get('reports')
  async reports(@Query() query: CanteenReportsQueryDto) {
    const toDate = query.to ?? new Date().toISOString().slice(0, 10);
    const fromDate =
      query.from ??
      new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { data: await this.service.getReports(fromDate, toDate) };
  }
}
