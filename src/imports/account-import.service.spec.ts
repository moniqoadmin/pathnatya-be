import { AccountImportService } from './account-import.service';

describe('AccountImportService', () => {
  it('rejects files that are not xlsx', async () => {
    const service = new AccountImportService(
      {} as never,
      {} as never,
      {} as never,
      { get: (_key: string, fallback: number) => fallback } as never,
    );

    await expect(
      service.create(
        {
          originalname: 'accounts.xls',
          mimetype: 'application/vnd.ms-excel',
          size: 10,
          buffer: Buffer.from('not-an-xlsx'),
        } as Express.Multer.File,
        '9ad70fb8-582a-42c2-b428-9607a2c6bb15',
      ),
    ).rejects.toThrow('Only .xlsx files are supported');
  });
});
