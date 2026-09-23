import * as ExcelJS from 'exceljs';
import { ExcelAnalyzerService } from './excel-analyzer.service';

describe('ExcelAnalyzerService', () => {
  const analyzer = new ExcelAnalyzerService();

  it('detects a header row below title rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Summary');
    sheet.addRow(['Janmashtami 2026 Nivedan']);
    sheet.addRow([]);
    sheet.addRow(['Taluka', 'Kendra Name', 'Mobile No', 'Teams']);
    sheet.addRow(['Haveli', 'Baner', '9876543210', 4]);
    sheet.addRow(['Haveli', 'Aundh', '9123456789', 2]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const analysis = await analyzer.analyze(buffer);

    expect(analysis.selectedSheet).toBe('Summary');
    expect(analysis.headerRow).toBe(3);
    expect(analysis.columns.map((column) => column.header)).toEqual([
      'Taluka',
      'Kendra Name',
      'Mobile No',
      'Teams',
    ]);
    expect(analysis.sheets[0].dataRowCount).toBe(2);
  });
});
