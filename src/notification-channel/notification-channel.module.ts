import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationChannelController } from './notification-channel.controller';
import { NotificationChannelService } from './notification-channel.service';
import { NotificationChannelFactory } from './services/notification-channel.factory';
import { GmailChannel } from './channels/gmail.channel';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import { SlackChannel } from './channels/slack.channel';
import { NotificationChannel } from './entities/notification-channel.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationChannel])],
  controllers: [NotificationChannelController],
  providers: [
    NotificationChannelService,
    NotificationChannelFactory,
    GmailChannel,
    WhatsAppChannel,
    SlackChannel,
  ],
  exports: [NotificationChannelService, NotificationChannelFactory],
})
export class NotificationChannelModule {}
