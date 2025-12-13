import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel } from './entities/notification-channel.entity';
import { CreateNotificationChannelDto, UpdateNotificationChannelDto } from './dto/create-notification-channel.dto';

@Injectable()
export class NotificationChannelService {
  private readonly logger = new Logger(NotificationChannelService.name);

  constructor(
    @InjectRepository(NotificationChannel)
    private channelRepository: Repository<NotificationChannel>,
  ) {}

  async create(createDto: CreateNotificationChannelDto): Promise<NotificationChannel> {
    const channel = this.channelRepository.create(createDto);
    return await this.channelRepository.save(channel);
  }

  async findAll(): Promise<NotificationChannel[]> {
    return await this.channelRepository.find();
  }

  async findActive(): Promise<NotificationChannel[]> {
    return await this.channelRepository.find({
      where: { activo: true },
    });
  }

  async findOne(id: string): Promise<NotificationChannel> {
    const channel = await this.channelRepository.findOne({ where: { id } });
    if (!channel) {
      throw new NotFoundException(`Notification channel with ID ${id} not found`);
    }
    return channel;
  }

  async update(id: string, updateDto: UpdateNotificationChannelDto): Promise<NotificationChannel> {
    const channel = await this.findOne(id);
    Object.assign(channel, updateDto);
    return await this.channelRepository.save(channel);
  }

  async toggleActive(id: string): Promise<NotificationChannel> {
    const channel = await this.findOne(id);
    channel.activo = !channel.activo;
    return await this.channelRepository.save(channel);
  }

  async remove(id: string): Promise<void> {
    const channel = await this.findOne(id);
    await this.channelRepository.remove(channel);
  }
}
