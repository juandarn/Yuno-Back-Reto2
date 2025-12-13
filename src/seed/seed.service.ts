import { Injectable } from '@nestjs/common';
import { CreateSeedDto } from './dto/create-seed.dto';
import { UpdateSeedDto } from './dto/update-seed.dto';

@Injectable()
export class SeedService {
  seed() {
    return 'This action adds a new seed';
  }
}
