import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import * as ExcelJS from 'exceljs';
import { createObjectCsvWriter } from 'csv-writer';
import * as puppeteer from 'puppeteer';
import { ensureDirCreation, generateGuid } from '../helpers/common.helper';

export interface ExcelSheet {
  name: string;
  header: { text: string; datafield: string }[];
  body: Record<string, unknown>[];
}

/** CDN references for export HTML templates */
export interface ExportCdns {
  echarts: string;
  jquery: string;
  jqxBase: string;
  jqxCore: string;
  jqxData: string;
  jqxButtons: string;
  jqxScrollbar: string;
  jqxMenu: string;
  jqxGrid: string;
  jqxGridSelection: string;
  jqxGridColumnsResize: string;
  font: string;
}

@Injectable()
export class ExportHelperService {
  private readonly logger = new Logger(ExportHelperService.name);
  private readonly exportDir = join(process.cwd(), 'assets', 'exports');
  private readonly puppeteerArgs = ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage'];

  // --- Excel ---

  async exportTabularToExcel(sheets: ExcelSheet[]): Promise<string> {
    await ensureDirCreation(this.exportDir);

    const workbook = new ExcelJS.Workbook();
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31)); // Excel 31 char limit

      // Header row
      const headerRow = sheet.header.map((h) => h.text);
      const row = worksheet.addRow(headerRow);
      row.font = { bold: true };

      // Data rows
      for (const record of sheet.body) {
        const dataRow = sheet.header.map((h) => {
          const val = record[h.datafield];
          return val === null || val === undefined ? '' : val;
        });
        worksheet.addRow(dataRow);
      }

      // Auto-width columns
      worksheet.columns.forEach((col) => {
        let maxLength = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          if (cellLength > maxLength) maxLength = cellLength;
        });
        col.width = Math.min(maxLength + 2, 50);
      });
    }

    const fileName = `export_${Date.now()}.xlsx`;
    const filePath = join(this.exportDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    this.logger.log(`Excel exported: ${filePath}`);
    return filePath;
  }

  // --- CSV ---

  async exportTableCSV(header: { id: string; title: string }[], body: Record<string, unknown>[]): Promise<string> {
    const dir = join(this.exportDir, 'csv');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.csv`);

    const csvWriter = createObjectCsvWriter({ path: filePath, header });
    await csvWriter.writeRecords(body);
    this.logger.log(`CSV exported: ${filePath}`);
    return filePath;
  }

  // --- JSON ---

  async exportJSON(jsonContent: string): Promise<string> {
    const dir = join(this.exportDir, 'json');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.json`);

    await writeFile(filePath, jsonContent, 'utf-8');
    this.logger.log(`JSON exported: ${filePath}`);
    return filePath;
  }

  // --- HTML ---

  async exportHtml(htmlContent: string): Promise<string> {
    const dir = join(this.exportDir, 'html');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.html`);

    await writeFile(filePath, htmlContent, 'utf-8');
    this.logger.log(`HTML exported: ${filePath}`);
    return filePath;
  }

  // --- PDF (via Puppeteer) ---

  async exportPDF(htmlFilePath: string): Promise<string> {
    const dir = join(this.exportDir, 'pdf');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.pdf`);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: this.puppeteerArgs,
        waitForInitialPage: true,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1580, height: 2240 });
      await page.goto(`file://${htmlFilePath}`, { waitUntil: 'domcontentloaded', timeout: 0 });

      // First pass: measure height
      const initialBuffer = await page.pdf({
        format: 'a2',
        landscape: false,
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
        timeout: 0,
      });
      // Estimate page count from buffer size (approximation)
      const estimatedPages = Math.max(1, Math.ceil(initialBuffer.length / 100000));
      const customHeight = Math.min(estimatedPages * 23.4, 200);

      // Final pass: generate PDF with calculated height
      await page.pdf({
        path: filePath,
        width: '16.54in',
        height: `${customHeight}in`,
        landscape: false,
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' },
        timeout: 0,
      });

      this.logger.log(`PDF exported: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error('PDF export failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  // --- PNG (via Puppeteer) ---

  async exportPNG(htmlFilePath: string): Promise<string> {
    const dir = join(this.exportDir, 'png');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.png`);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: this.puppeteerArgs,
        waitForInitialPage: true,
      });
      const page = await browser.newPage();
      await page.goto(`file://${htmlFilePath}`, { waitUntil: 'domcontentloaded', timeout: 0 });
      await new Promise((r) => setTimeout(r, 3000)); // Wait for rendering
      await page.screenshot({ path: filePath, fullPage: true });

      this.logger.log(`PNG exported: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error('PNG export failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  // --- JPEG (via Puppeteer) ---

  async exportJPEG(htmlFilePath: string): Promise<string> {
    const dir = join(this.exportDir, 'jpeg');
    await ensureDirCreation(dir);
    const filePath = join(dir, `${generateGuid()}.jpeg`);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: this.puppeteerArgs,
        waitForInitialPage: true,
      });
      const page = await browser.newPage();
      await page.goto(`file://${htmlFilePath}`, { waitUntil: 'domcontentloaded', timeout: 0 });
      await new Promise((r) => setTimeout(r, 3000)); // Wait for rendering
      await page.screenshot({ path: filePath, fullPage: true, type: 'jpeg' });

      this.logger.log(`JPEG exported: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error('JPEG export failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  // --- CDN references for HTML templates ---

  getExportCdns(useLocal = false): ExportCdns {
    if (useLocal) {
      const cdnBase = join(process.cwd(), 'assets', 'cdns');
      return {
        echarts: `${cdnBase}/echarts.min.js`,
        jquery: `${cdnBase}/jquery.min.js`,
        jqxBase: `${cdnBase}/jqx.base.min.css`,
        jqxCore: `${cdnBase}/jqxcore.min.js`,
        jqxData: `${cdnBase}/jqxdata.min.js`,
        jqxButtons: `${cdnBase}/jqxbuttons.min.js`,
        jqxScrollbar: `${cdnBase}/jqxscrollbar.min.js`,
        jqxMenu: `${cdnBase}/jqxmenu.min.js`,
        jqxGrid: `${cdnBase}/jqxgrid.min.js`,
        jqxGridSelection: `${cdnBase}/jqxgrid.selection.min.js`,
        jqxGridColumnsResize: `${cdnBase}/jqxgrid.columnsresize.min.js`,
        font: `${cdnBase}/Roboto-Regular.ttf`,
      };
    }

    const jqxBase = 'https://cdnjs.cloudflare.com/ajax/libs/jqwidgets/12.0.2/jqwidgets';
    return {
      echarts: 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.1.0/echarts.min.js',
      jquery: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js',
      jqxBase: `${jqxBase}/styles/jqx.base.min.css`,
      jqxCore: `${jqxBase}/jqxcore.min.js`,
      jqxData: `${jqxBase}/jqxdata.min.js`,
      jqxButtons: `${jqxBase}/jqxbuttons.min.js`,
      jqxScrollbar: `${jqxBase}/jqxscrollbar.min.js`,
      jqxMenu: `${jqxBase}/jqxmenu.min.js`,
      jqxGrid: `${jqxBase}/jqxgrid.min.js`,
      jqxGridSelection: `${jqxBase}/jqxgrid.selection.min.js`,
      jqxGridColumnsResize: `${jqxBase}/jqxgrid.columnsresize.min.js`,
      font: 'https://fonts.googleapis.com/css2?family=Roboto&display=swap',
    };
  }

  /** Remove a temporary file (used after HTML→PDF/PNG/JPEG conversion) */
  async cleanupFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      this.logger.warn(`Failed to cleanup: ${filePath}`);
    }
  }
}
