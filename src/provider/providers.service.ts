import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './entities/provider.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providerRepository: Repository<Provider>,
  ) {}

  /**
   * Create a new provider
   */
  async create(createProviderDto: CreateProviderDto): Promise<Provider> {
    const provider = this.providerRepository.create(createProviderDto);
    return await this.providerRepository.save(provider);
  }

  /**
   * Get all providers
   */
  async findAll(): Promise<Provider[]> {
    return await this.providerRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Get a provider by ID
   */
  async findOne(id: string): Promise<Provider> {
    const provider = await this.providerRepository.findOne({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }

    return provider;
  }

  /**
   * Update a provider
   */
  async update(
    id: string,
    updateProviderDto: UpdateProviderDto,
  ): Promise<Provider> {
    const provider = await this.findOne(id);

    Object.assign(provider, updateProviderDto);

    return await this.providerRepository.save(provider);
  }

  /**
   * Delete a provider
   */
  async remove(id: string): Promise<void> {
    const provider = await this.findOne(id);
    await this.providerRepository.remove(provider);
  }

  /**
   * Check if a provider exists by name
   */
  async existsByName(name: string): Promise<boolean> {
    const count = await this.providerRepository.count({
      where: { name },
    });
    return count > 0;
  }
}
