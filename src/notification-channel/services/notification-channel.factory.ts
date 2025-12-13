import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import { GmailChannel } from '../channels/gmail.channel';
import { WhatsAppChannel } from '../channels/whatsapp.channel';
import { SlackChannel } from '../channels/slack.channel';

@Injectable()
export class NotificationChannelFactory {
  private readonly logger = new Logger(NotificationChannelFactory.name);
  private channels: Map<string, INotificationChannel>;

  constructor(
    private readonly gmailChannel: GmailChannel,
    private readonly whatsappChannel: WhatsAppChannel,
    private readonly slackChannel: SlackChannel,
  ) {
    this.channels = new Map();
    this.registerChannel(gmailChannel);
    this.registerChannel(whatsappChannel);
    this.registerChannel(slackChannel);
  }

  private registerChannel(channel: INotificationChannel): void {
    this.channels.set(channel.getName(), channel);
    this.logger.log(`Registered notification channel: ${channel.getName()}`);
  }

  getChannel(channelName: string): INotificationChannel | undefined {
    const channel = this.channels.get(channelName);
    if (!channel) {
      this.logger.warn(`Channel not found: ${channelName}`);
    }
    return channel;
  }

  getAvailableChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}
