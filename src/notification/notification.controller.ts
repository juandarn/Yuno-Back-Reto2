import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import type { NotificationPayload } from '../notification-channel/interfaces/notification-channel.interface';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateNotificationDto) {
    return this.notificationService.create(createDto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(
    @Param('id') id: string,
    @Body('channelType') channelType: string,
    @Body('payload') payload: NotificationPayload,
  ) {
    const success = await this.notificationService.sendNotification(
      id,
      channelType,
      payload,
    );
    return {
      success,
      message: success
        ? 'Notification sent successfully'
        : 'Failed to send notification',
    };
  }

  @Get()
  findAll() {
    return this.notificationService.findAll();
  }

  @Get('channels')
  getAvailableChannels() {
    return {
      channels: this.notificationService.getAvailableChannels(),
    };
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.notificationService.findByUser(userId);
  }

  @Get('alert/:alertId')
  findByAlert(@Param('alertId') alertId: string) {
    return this.notificationService.findByAlert(alertId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.notificationService.updateStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.notificationService.remove(id);
  }
}
