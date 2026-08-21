import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppConfigurationsService } from './app-configurations.service';

const videoConfig = {
  DEFAULT_HLS_SOURCE:
    'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
  ALLOWED_HOSTS: ['pathnatya-video-cdn.b-cdn.net'],
};

describe('AppConfigurationsService', () => {
  const manager = {
    transaction: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    upsert: jest.fn(),
    save: jest.fn(),
    manager,
  };
  const service = new AppConfigurationsService(repository as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('lists configurations by id', async () => {
    const rows = [{ id: 1, videoConfig, videoFiles: [] }];
    repository.find.mockResolvedValue(rows);

    await expect(service.findAll()).resolves.toEqual(rows);
    expect(repository.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
  });

  it('returns one configuration by id', async () => {
    const row = { id: 1, videoConfig, videoFiles: [] };
    repository.findOne.mockResolvedValue(row);

    await expect(service.findOne(1)).resolves.toEqual(row);
  });

  it('throws when a configuration is missing', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts by id and returns the saved row', async () => {
    const saved = { id: 1, videoConfig, videoFiles: [] };
    repository.upsert.mockResolvedValue(undefined);
    repository.findOne.mockResolvedValue(saved);

    await expect(
      service.upsert({ id: 1, videoConfig, videoFiles: [] }),
    ).resolves.toEqual(saved);
    expect(repository.upsert).toHaveBeenCalledWith(
      { id: 1, videoConfig, videoFiles: [] },
      ['id'],
    );
  });

  it('updates videoConfig on an existing row', async () => {
    const existing = {
      id: 1,
      videoConfig,
      videoFiles: [{ name: 'a' }],
    };
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockImplementation(async (value: unknown) => value);

    const nextConfig = {
      DEFAULT_HLS_SOURCE: 'https://cdn.example/playlist.m3u8',
      ALLOWED_HOSTS: ['cdn.example'],
    };
    const saved = await service.update(1, { videoConfig: nextConfig });

    expect(saved.videoConfig).toEqual(nextConfig);
    expect(saved.videoFiles).toEqual([{ name: 'a' }]);
  });

  it('rejects an update with no fields', async () => {
    await expect(service.update(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('throws when updating a missing configuration', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.update(99, { videoFiles: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renames the id and remaps accounts that referenced it', async () => {
    const existing = { id: 1, videoConfig, videoFiles: [] };
    const renamed = { id: 2, videoConfig, videoFiles: [] };
    repository.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(renamed);
    manager.transaction.mockImplementation(
      async (work: (txn: typeof manager) => Promise<void>) => work(manager),
    );

    await expect(service.update(1, { id: 2 })).resolves.toEqual(renamed);
    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), {
      id: 2,
      videoConfig,
      videoFiles: [],
    });
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { appConfiguration: 1 },
      { appConfiguration: 2 },
    );
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { id: 1 });
  });

  it('rejects renaming onto an id that already exists', async () => {
    repository.findOne
      .mockResolvedValueOnce({ id: 1, videoConfig, videoFiles: [] })
      .mockResolvedValueOnce({ id: 2, videoConfig, videoFiles: [] });

    await expect(service.update(1, { id: 2 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
