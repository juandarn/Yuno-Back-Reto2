import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AlertService } from './alert.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  AlertStatus,
} from './dto/create-alert.dto';

@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateAlertDto) {
    return this.alertService.create(createDto);
  }

  @Get()
  findAll(@Query('status') status?: AlertStatus) {
    if (status) {
      return this.alertService.findByStatus(status);
    }
    return this.alertService.findAll();
  }

  @Get('merchant/:merchantId')
  findByMerchant(@Param('merchantId') merchantId: string) {
    return this.alertService.findByMerchant(merchantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alertService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateAlertDto) {
    return this.alertService.update(id, updateDto);
  }

  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string) {
    return this.alertService.acknowledge(id);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.alertService.resolve(id);
  }

  @Post(':id/resend-notifications')
  @HttpCode(HttpStatus.OK)
  async resendNotifications(@Param('id') id: string) {
    await this.alertService.resendNotifications(id);
    return {
      message: 'Notifications resent successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.alertService.remove(id);
  }
}
