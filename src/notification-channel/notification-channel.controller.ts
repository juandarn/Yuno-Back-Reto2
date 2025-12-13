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
import { NotificationChannelService } from './notification-channel.service';
import { CreateNotificationChannelDto, UpdateNotificationChannelDto } from './dto/create-notification-channel.dto';

@Controller('notification-channels')
export class NotificationChannelController {
  constructor(private readonly channelService: NotificationChannelService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateNotificationChannelDto) {
    return this.channelService.create(createDto);
  }

  @Get()
  findAll() {
    return this.channelService.findAll();
  }

  @Get('active')
  findActive() {
    return this.channelService.findActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.channelService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateNotificationChannelDto,
  ) {
    return this.channelService.update(id, updateDto);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string) {
    return this.channelService.toggleActive(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.channelService.remove(id);
  }
}
