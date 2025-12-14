import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OnCallService } from './on-call.service';
import {
  CreateOnCallScheduleDto,
  UpdateOnCallScheduleDto,
} from './dto/on-call-schedule.dto';

@Controller('on-call')
export class OnCallController {
  constructor(private readonly onCallService: OnCallService) {}

  @Post()
  create(@Body() createDto: CreateOnCallScheduleDto) {
    return this.onCallService.create(createDto);
  }

  @Get()
  findAll(@Query('active') active?: string) {
    const activeBool =
      typeof active === 'string' ? active.toLowerCase() === 'true' : undefined;

    return this.onCallService.findAll(activeBool);
  }

  @Get('current')
  current() {
    return this.onCallService.current();
  }

  @Get('priority/:priority')
  findByPriority(@Param('priority', ParseIntPipe) priority: number) {
    return this.onCallService.findByPriority(priority);
  }

  @Get('user/:id')
  findByUser(@Param('id') userId: string) {
    return this.onCallService.findByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.onCallService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateOnCallScheduleDto) {
    return this.onCallService.update(id, updateDto);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string) {
    return this.onCallService.toggleActive(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.onCallService.remove(id);
  }
}
