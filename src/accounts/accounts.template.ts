import { AccountRole } from './entities/account.entity';

// Defaults applied when these fields are omitted on create / bulk upload.
export const ACCOUNT_FIELD_DEFAULTS = {
  role: AccountRole.USER,
  numberOfReboot: 0,
  appConfiguration: 1,
  logoutButton: false,
  isOffline: true,
  source: 'curl',
} as const;

// Columns used for the bulk-upload Excel template. The `header` is what the
// user sees in the downloaded file; `field` maps to the account property (or a
// derived value such as countryCode / kendraType). `aliases` are normalized
// header forms accepted on upload (whitespace collapsed, lowercased).
export interface TemplateColumn {
  header: string;
  field:
    | 'sn'
    | 'country'
    | 'sanghat'
    | 'jilha'
    | 'taluka'
    | 'group'
    | 'kendraType'
    | 'kendra'
    | 'sanchalakName'
    | 'sanchalakOrAvekshak'
    | 'countryCode'
    | 'phoneNumber'
    | 'numberOfTeams'
    | 'updatedNumberOfTeams'
    | 'role'
    | 'numberOfReboot'
    | 'appConfiguration'
    | 'logoutButton'
    | 'isOffline'
    | 'source';
  aliases: string[];
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  {
    header: 'SN',
    field: 'sn',
    aliases: ['sn', 's.n.', 'sr no', 'sr. no.', 'serial number'],
  },
  {
    header: 'Country Name',
    field: 'country',
    aliases: ['country name', 'country'],
  },
  {
    header: 'Sanghat Name',
    field: 'sanghat',
    aliases: ['sanghat name', 'sanghat'],
  },
  {
    header: 'Jilla Name',
    field: 'jilha',
    aliases: [
      'jilla name',
      'jilha name',
      'zilla name',
      'jilla',
      'jilha',
      'zilla',
    ],
  },
  {
    header: 'Taluka Name',
    field: 'taluka',
    aliases: ['taluka name', 'taluka'],
  },
  {
    header: 'Group Name',
    field: 'group',
    aliases: ['group name', 'group'],
  },
  {
    header: 'Yuva Kendra or DPC',
    field: 'kendraType',
    aliases: ['yuva kendra or dpc'],
  },
  {
    header: 'Yuva Kendra or DPC Name',
    field: 'kendra',
    aliases: ['yuva kendra or dpc name', 'kendra'],
  },
  {
    header: 'Sanchalak Name / Avekshak Name',
    field: 'sanchalakName',
    aliases: [
      'sanchalak name / avekshak name',
      'sanchalak name /avekshak name',
      'sanchalak name /avekshak name (only 1 per yuva kendra)',
      'sanchalak name / avekshak name (only 1 per yuva kendra)',
      'sanchalakname',
    ],
  },
  {
    // Kept for compatibility with existing sheets. Not used as AccountRole.
    header: 'Sanchalak/Avekshak S/A',
    field: 'sanchalakOrAvekshak',
    aliases: ['sanchalak/avekshak s/a'],
  },
  {
    header: 'Country Code',
    field: 'countryCode',
    aliases: ['country code', 'country code eg: 91 or 44 or 1'],
  },
  {
    header: 'Mobile Number',
    field: 'phoneNumber',
    aliases: [
      'mobile number',
      'mobile number ex: 9999999999',
      'mobile number ex: 999999999',
      'phonenumber',
      'phone number',
    ],
  },
  {
    header: 'No. of Teams Expected',
    field: 'numberOfTeams',
    aliases: [
      'no. of teams expected',
      'no of teams expected',
      'number of teams',
      'numberofteams',
    ],
  },
  {
    // Present on nivedan sheets for bulk team-number updates. Not included in
    // the downloaded create template (see generateTemplate).
    header: 'Updated No. of Teams Expected',
    field: 'updatedNumberOfTeams',
    aliases: [
      'updated no. of teams expected',
      'updated no of teams expected',
      'updated number of teams',
      'updated number of teams expected',
    ],
  },
  {
    header: 'role',
    field: 'role',
    aliases: ['role'],
  },
  {
    header: 'No. of Reboot',
    field: 'numberOfReboot',
    aliases: [
      'no. of reboot',
      'no of reboot',
      'number of reboot',
      'numberofreboot',
    ],
  },
  {
    header: 'App Configuration',
    field: 'appConfiguration',
    aliases: ['app configuration', 'appconfiguration'],
  },
  {
    header: 'Logout Button',
    field: 'logoutButton',
    aliases: ['logout button', 'logoutbutton'],
  },
  {
    header: 'Is Offline',
    field: 'isOffline',
    aliases: ['is offline', 'isoffline', 'offline'],
  },
  {
    header: 'Source',
    field: 'source',
    aliases: ['source'],
  },
];

export const TEMPLATE_SHEET_NAME = 'accounts';

// Create-template columns omit the nivedan-only "Updated No. of Teams Expected".
export const CREATE_TEMPLATE_COLUMNS: TemplateColumn[] =
  TEMPLATE_COLUMNS.filter((column) => column.field !== 'updatedNumberOfTeams');

// Collapse newlines / extra spaces and lowercase for header matching.
export function normalizeHeader(header: string): string {
  return header.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Maps dialing codes from the sheet to Account.country values when Country
// Name is not present.
export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  '91': 'India',
  '44': 'UK',
  '1': 'US',
};
