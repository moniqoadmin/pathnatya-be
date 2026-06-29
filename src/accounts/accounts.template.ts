// Columns used for the bulk-upload Excel template. The `header` is what the
// user sees in the downloaded file; `field` maps to the account property.
export interface TemplateColumn {
  header: string;
  field:
    | 'phoneNumber'
    | 'password'
    | 'status'
    | 'country'
    | 'sanghat'
    | 'jilha'
    | 'taluka'
    | 'group'
    | 'kendra'
    | 'sanchalakName';
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { header: 'phoneNumber', field: 'phoneNumber' },
  { header: 'password', field: 'password' },
  { header: 'status', field: 'status' },
  { header: 'country', field: 'country' },
  { header: 'sanghat', field: 'sanghat' },
  { header: 'jilha', field: 'jilha' },
  { header: 'taluka', field: 'taluka' },
  { header: 'group', field: 'group' },
  { header: 'kendra', field: 'kendra' },
  { header: 'sanchalakName', field: 'sanchalakName' },
];

export const TEMPLATE_SHEET_NAME = 'accounts';
