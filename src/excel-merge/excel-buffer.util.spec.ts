import { toExcelBuffer, isXlsxZip } from './excel-buffer.util';

describe('excel-buffer.util', () => {
  const zip = Buffer.from('PK\u0003\u0004rest');

  it('copies Node buffers and JSON Buffer objects', () => {
    expect(toExcelBuffer(zip).equals(zip)).toBe(true);
    expect(
      toExcelBuffer({ type: 'Buffer', data: Array.from(zip) }).equals(zip),
    ).toBe(true);
    expect(isXlsxZip(zip)).toBe(true);
    expect(isXlsxZip(Buffer.from('not-excel'))).toBe(false);
  });
});
