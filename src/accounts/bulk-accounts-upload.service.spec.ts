import * as ExcelJS from 'exceljs';
import { AccountRole } from './entities/account.entity';
import { BulkAccountsUploadService } from './bulk-accounts-upload.service';

async function workbookBuffer(
  rows: Array<{
    phoneNumber: string;
    role?: string;
    numberOfTeams?: string | number;
    updatedNumberOfTeams?: string | number;
  }>,
  options?: { includeUpdatedColumn?: boolean },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('accounts');
  sheet.columns = [
    { header: 'Mobile Number', key: 'phoneNumber' },
    { header: 'role', key: 'role' },
    { header: 'No. of Teams Expected', key: 'numberOfTeams' },
    ...(options?.includeUpdatedColumn
      ? [
          {
            header: 'Updated No. of Teams Expected',
            key: 'updatedNumberOfTeams',
          },
        ]
      : []),
  ];
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('BulkAccountsUploadService', () => {
  const inserted: Array<{
    phoneNumber: string;
    role: AccountRole;
    numberOfTeams: number | null;
  }> = [];
  const updated: Array<{ id: string; numberOfTeams: number }> = [];
  const accountsRepository = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: unknown) => value),
    insert: jest.fn(),
    manager: {
      transaction: jest.fn(
        async (
          work: (manager: {
            insert: jest.Mock;
            update: jest.Mock;
            remove: jest.Mock;
          }) => Promise<void>,
        ) => {
          await work({
            insert: jest.fn(
              async (
                _entity: unknown,
                rows: Array<{
                  phoneNumber: string;
                  role: AccountRole;
                  numberOfTeams: number | null;
                }>,
              ) => {
                inserted.push(...rows);
              },
            ),
            update: jest.fn(
              async (
                _entity: unknown,
                id: string,
                values: { numberOfTeams: number },
              ) => {
                updated.push({ id, numberOfTeams: values.numberOfTeams });
              },
            ),
            remove: jest.fn(),
          });
        },
      ),
    },
  };
  const teamsRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const service = new BulkAccountsUploadService(
    accountsRepository as never,
    teamsRepository as never,
  );

  beforeEach(() => {
    inserted.length = 0;
    updated.length = 0;
    accountsRepository.find.mockResolvedValue([]);
    accountsRepository.create.mockImplementation((value: unknown) => value);
    teamsRepository.find.mockResolvedValue([]);
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

  it('ceils fractional team counts to the next whole number', async () => {
    const buffer = await workbookBuffer([
      {
        phoneNumber: '9876543210',
        role: 'User',
        numberOfTeams: 1.5,
      },
      {
        phoneNumber: '9876543211',
        role: 'User',
        numberOfTeams: '2.1',
      },
    ]);

    const result = await service.bulkUpload(buffer);

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phoneNumber: '9876543210',
          numberOfTeams: 2,
        }),
        expect.objectContaining({
          phoneNumber: '9876543211',
          numberOfTeams: 3,
        }),
      ]),
    );
  });

  it('strips spaces, hyphens, and other non-digits from phone numbers and accepts 9 or 10 digits', async () => {
    const buffer = await workbookBuffer([
      { phoneNumber: ' 9876543212 ', role: 'User', numberOfTeams: 1 },
      { phoneNumber: ' 9876543213 `', role: 'User', numberOfTeams: 1 },
      { phoneNumber: '32183 3 2132', role: 'User', numberOfTeams: 1 },
      { phoneNumber: '3213-321-321', role: 'User', numberOfTeams: 1 },
      { phoneNumber: ' 3 219387 2 2 2 ', role: 'User', numberOfTeams: 1 },
      { phoneNumber: '987654321', role: 'User', numberOfTeams: 1 },
    ]);

    const result = await service.bulkUpload(buffer);

    expect(result.created).toBe(6);
    expect(result.failed).toBe(0);
    expect(inserted.map((row) => row.phoneNumber).sort()).toEqual([
      '3213321321',
      '3218332132',
      '3219387222',
      '987654321',
      '9876543212',
      '9876543213',
    ]);
  });

  it('rejects phone numbers that are not 9 or 10 digits after cleaning', async () => {
    const buffer = await workbookBuffer([
      { phoneNumber: '12345678', role: 'User' },
      { phoneNumber: '12345678901', role: 'User' },
    ]);

    const result = await service.bulkUpload(buffer);

    expect(result.created).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: 'phone number is not 9 or 10 digits' }),
      ]),
    );
  });

  it('does not create a user row when numberOfTeams is missing or not a valid number', async () => {
    const buffer = await workbookBuffer([
      { phoneNumber: '9876543210', role: 'User', numberOfTeams: '-' },
      { phoneNumber: '9876543211', role: 'User', numberOfTeams: '–' },
      { phoneNumber: '9876543212', role: 'User' },
      { phoneNumber: '9876543213', role: 'User', numberOfTeams: 'abc' },
      { phoneNumber: '9876543214', role: 'User', numberOfTeams: 2 },
    ]);

    const result = await service.bulkUpload(buffer);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(4);
    expect(inserted).toEqual([
      expect.objectContaining({
        phoneNumber: '9876543214',
        numberOfTeams: 2,
      }),
    ]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phoneNumber: '9876543210',
          error: 'team number is not a valid number',
        }),
        expect.objectContaining({
          phoneNumber: '9876543212',
          error: 'team number is not a valid number',
        }),
        expect.objectContaining({
          phoneNumber: '9876543213',
          error: 'No. of Teams Expected must be a number >= 1',
        }),
      ]),
    );
  });

  it('applies the same phone cleaning, 9/10-digit check, and team-count ceiling on team updates', async () => {
    accountsRepository.find.mockResolvedValue([
      { id: 'a1', phoneNumber: '9876543212', numberOfTeams: 1 },
      { id: 'a2', phoneNumber: '3218332132', numberOfTeams: 1 },
      { id: 'a3', phoneNumber: '3213321321', numberOfTeams: 1 },
      { id: 'a4', phoneNumber: '3219387222', numberOfTeams: 1 },
      { id: 'a5', phoneNumber: '987654321', numberOfTeams: 1 },
    ]);

    const buffer = await workbookBuffer(
      [
        {
          phoneNumber: ' 9876543212 `',
          updatedNumberOfTeams: 1.5,
        },
        {
          phoneNumber: '32183 3 2132',
          updatedNumberOfTeams: '2.1',
        },
        {
          phoneNumber: '3213-321-321',
          updatedNumberOfTeams: 3,
        },
        {
          phoneNumber: ' 3 219387 2 2 2 ',
          updatedNumberOfTeams: 1,
        },
        {
          phoneNumber: '987654321',
          updatedNumberOfTeams: 4,
        },
      ],
      { includeUpdatedColumn: true },
    );

    const result = await service.bulkUpdateTeamNumbers(buffer);

    expect(result.updated).toBe(5);
    expect(result.failed).toBe(0);
    expect(updated).toEqual(
      expect.arrayContaining([
        { id: 'a1', numberOfTeams: 2 },
        { id: 'a2', numberOfTeams: 3 },
        { id: 'a3', numberOfTeams: 3 },
        { id: 'a4', numberOfTeams: 1 },
        { id: 'a5', numberOfTeams: 4 },
      ]),
    );
  });

  it('does not update a row when the team count is missing or not a valid number', async () => {
    accountsRepository.find.mockResolvedValue([
      { id: 'a1', phoneNumber: '9876543210', numberOfTeams: 1 },
      { id: 'a2', phoneNumber: '9876543211', numberOfTeams: 1 },
    ]);

    const buffer = await workbookBuffer(
      [
        { phoneNumber: '9876543210', updatedNumberOfTeams: '-' },
        { phoneNumber: '9876543211', updatedNumberOfTeams: 3 },
      ],
      { includeUpdatedColumn: true },
    );

    const result = await service.bulkUpdateTeamNumbers(buffer);

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(updated).toEqual([{ id: 'a2', numberOfTeams: 3 }]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        phoneNumber: '9876543210',
        error: 'team number is not a valid number',
      }),
    ]);
  });
});
