import * as ExcelJS from 'exceljs';
import { AccountRole } from './entities/account.entity';
import { BulkAccountsUploadService } from './bulk-accounts-upload.service';

async function workbookBuffer(
  rows: Array<{
    phoneNumber: string;
    role?: string;
    numberOfTeams?: string | number;
  }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('accounts');
  sheet.columns = [
    { header: 'Mobile Number', key: 'phoneNumber' },
    { header: 'role', key: 'role' },
    { header: 'No. of Teams Expected', key: 'numberOfTeams' },
  ];
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('BulkAccountsUploadService', () => {
  const inserted: Array<{ role: AccountRole; numberOfTeams: number | null }> =
    [];
  const accountsRepository = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: unknown) => value),
    insert: jest.fn(),
    manager: {
      transaction: jest.fn(
        async (work: (manager: { insert: jest.Mock }) => Promise<void>) => {
          await work({
            insert: jest.fn(
              async (
                _entity: unknown,
                rows: Array<{
                  role: AccountRole;
                  numberOfTeams: number | null;
                }>,
              ) => {
                inserted.push(...rows);
              },
            ),
          });
        },
      ),
    },
  };
  const service = new BulkAccountsUploadService(
    accountsRepository as never,
    {} as never,
  );

  beforeEach(() => {
    inserted.length = 0;
    accountsRepository.find.mockResolvedValue([]);
    accountsRepository.create.mockImplementation((value: unknown) => value);
  });

  it('forces numberOfTeams to 1 for Admin, SuperAdmin, and Developer rows', async () => {
    const buffer = await workbookBuffer([
      {
        phoneNumber: '9876543210',
        role: 'Admin',
        numberOfTeams: 5,
      },
      {
        phoneNumber: '9876543211',
        role: 'SuperAdmin',
        numberOfTeams: 3,
      },
      {
        phoneNumber: '9876543212',
        role: 'Developer',
      },
      {
        phoneNumber: '9876543213',
        role: 'User',
        numberOfTeams: 4,
      },
    ]);

    const result = await service.bulkUpload(buffer);

    expect(result.created).toBe(4);
    expect(result.failed).toBe(0);
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phoneNumber: '9876543210',
          role: AccountRole.ADMIN,
          numberOfTeams: 1,
        }),
        expect.objectContaining({
          phoneNumber: '9876543211',
          role: AccountRole.SUPER_ADMIN,
          numberOfTeams: 1,
        }),
        expect.objectContaining({
          phoneNumber: '9876543212',
          role: AccountRole.DEVELOPER,
          numberOfTeams: 1,
        }),
        expect.objectContaining({
          phoneNumber: '9876543213',
          role: AccountRole.USER,
          numberOfTeams: 4,
        }),
      ]),
    );
  });
});
