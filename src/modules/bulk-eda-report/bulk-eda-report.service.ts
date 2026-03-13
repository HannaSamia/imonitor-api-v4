import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createObjectCsvWriter } from 'csv-writer';
import { parse } from 'fast-csv';
import { createReadStream, promises as fsPromise } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { CoreBulkEdaReports } from '../../database/entities/core-bulk-eda-reports.entity';
import { CustomerCareService } from '../customer-care/customer-care.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { SystemKeys } from '../../shared/constants/system-keys';
import { generateGuid, isUndefinedOrNull } from '../../shared/helpers/common.helper';
import { BulkProcessFileType } from '../bulk-processing/enums/bulk-process.enum';
import { ListBulkEdaDTO } from './dto/bulk-eda-report.dto';

const EDA_INPUT_PATH = join(process.cwd(), 'assets/eda/bulkProcessing');
const EDA_OUTPUT_PATH = join(process.cwd(), 'assets/eda/bulkProcessingOutput');

@Injectable()
export class BulkEdaReportService {
  constructor(
    @InjectRepository(CoreBulkEdaReports)
    private readonly bulkEdaRepo: Repository<CoreBulkEdaReports>,
    private readonly customerCareService: CustomerCareService,
    private readonly systemConfig: SystemConfigService,
    private readonly dateHelper: DateHelperService,
  ) {}

  async list(): Promise<ListBulkEdaDTO[]> {
    const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
    const fmt = dateFormat ?? '%Y-%m-%d %H:%i:%s';
    return this.bulkEdaRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.fileOriginalName AS name',
        'p.status AS status',
        `DATE_FORMAT(p.processingDate, '${fmt}') AS processingDate`,
        `DATE_FORMAT(p.createdAt, '${fmt}') AS createdAt`,
        '(SELECT u.userName FROM core_application_users u WHERE u.id = p.createdBy) AS createdBy',
      ])
      .where('p.isDeleted = 0')
      .orderBy('p.createdAt', 'DESC')
      .getRawMany<ListBulkEdaDTO>();
  }

  async uploadCSV(currentUserId: string, file: Express.Multer.File): Promise<string> {
    const processId = generateGuid();
    const fileName = `${processId}.csv`;
    const filePath = join(EDA_INPUT_PATH, fileName);

    await fsPromise.mkdir(EDA_INPUT_PATH, { recursive: true });
    await fsPromise.mkdir(EDA_OUTPUT_PATH, { recursive: true });
    await fsPromise.writeFile(filePath, file.buffer as Uint8Array);

    // Validate max 50 rows
    const csvValues = await this.readCsv<{ phoneNumber: string }>(filePath);
    if (csvValues.length > 50) {
      await fsPromise.unlink(filePath);
      throw new BadRequestException(ErrorMessages.EDA_UPLOAD_FAILED_MAX_50_ROWS);
    }

    const now = new Date();
    const record = this.bulkEdaRepo.create({
      id: processId,
      status: 'processing',
      inputFile: fileName,
      createdBy: currentUserId,
      createdAt: now,
      fileOriginalName: file.originalname,
      processingDate: now,
      isDeleted: 0,
    });
    await this.bulkEdaRepo.save(record);

    const tempCsvFileName = `${processId}_output.csv`;
    const tempCsvFilePath = join(EDA_OUTPUT_PATH, tempCsvFileName);
    const outFileNameExcel = `${processId}_output.xlsx`;
    const outFilePathExcel = join(EDA_OUTPUT_PATH, outFileNameExcel);

    const csvWriter = createObjectCsvWriter({
      path: tempCsvFilePath,
      header: [
        { id: 'msisdn', title: 'MSISDN' },
        { id: 'imsi', title: 'IMSI' },
        { id: 'oick', title: 'OICK' },
        { id: 'csp', title: 'CSP' },
        { id: 'vlrAddress', title: 'VLR Address' },
        { id: 'sgsnNumber', title: 'SGSN Number' },
        { id: 'vlrData', title: 'VLR Data' },
        { id: 'ts11', title: 'TS11' },
        { id: 'ts21', title: 'TS21' },
        { id: 'ts22', title: 'TS22' },
        { id: 'apnid', title: 'APNID' },
        { id: 'tick', title: 'TICK' },
        { id: 'obo', title: 'OBO' },
        { id: 'obi', title: 'OBI' },
        { id: 'obssm', title: 'OBSSM' },
        { id: 'HLR_status', title: 'HLR Status' },
        { id: 'msisdn_hss', title: 'MSISDN HSS' },
        { id: 'HSS_IMSI', title: 'HSS IMSI' },
        { id: 'HSS_PROFILE_ID', title: 'HSS Profile ID' },
        { id: 'HSS_ODB', title: 'HSS ODB' },
        { id: 'msisdn_charging_system', title: 'MSISDN Charging System' },
        { id: 'service_class', title: 'Service Class' },
        { id: 'MA_BALANCE', title: 'MA Balance' },
        { id: 'Offers', title: 'Offers' },
        { id: 'DAs', title: 'DAs' },
      ],
    });

    const records = [];
    for (const row of csvValues) {
      const phoneNumber = row.phoneNumber;
      const isTest = false;
      const hlr = await this.customerCareService.getHLR(phoneNumber);
      const hss = await this.customerCareService.getHSS(phoneNumber);
      const sob = await this.customerCareService.getSob(phoneNumber, isTest);
      const offers = await this.customerCareService.getOffers(phoneNumber, isTest);
      const das = await this.customerCareService.getDedicatedAccounts(phoneNumber, isTest);

      const numberMatch = sob.balance.match(/\d+(\.\d+)?/);
      const sobBalance = numberMatch ? parseFloat(numberMatch[0]) : null;
      const offerIds = (offers.body as Array<{ offerID: number }>).map((o) => o.offerID).join('|');
      const daIds = (das.body as Array<{ dedicatedAccountID: number }>)
        .map((d) => String(d.dedicatedAccountID).match(/\d+/)?.[0] ?? '')
        .join('|');

      const hlrBody = hlr.body[0] ?? {};
      const hssBody = hss.body[0] ?? {};

      records.push({
        msisdn: phoneNumber,
        imsi: hlrBody.imsi,
        oick: hlrBody.oick,
        csp: hlrBody.csp,
        vlrAddress: hlrBody.vlrAddress,
        sgsnNumber: hlrBody.sgsnNumber,
        vlrData: hlrBody.vlrData,
        ts11: hlrBody.ts11,
        ts21: hlrBody.ts21,
        ts22: hlrBody.ts22,
        apnid: hlrBody.apnId,
        tick: hlrBody.tick,
        obo: hlrBody.obo,
        obi: hlrBody.obi,
        obssm: hlrBody.obssm,
        HLR_status: hlrBody.hlrStatus,
        msisdn_hss: phoneNumber,
        HSS_IMSI: hssBody.hss_imsi,
        HSS_PROFILE_ID: hssBody.hss_profileId,
        HSS_ODB: hssBody.hss_odb,
        msisdn_charging_system: phoneNumber,
        service_class: sob.serviceName,
        MA_BALANCE: sobBalance,
        Offers: offerIds,
        DAs: daIds,
      });
    }

    await csvWriter.writeRecords(records);

    // Convert CSV to Excel
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Data');
    const tableData: string[][] = [];

    await new Promise<void>((resolve, reject) => {
      createReadStream(tempCsvFilePath)
        .pipe(parse({ delimiter: ',' }))
        .on('data', (row: string[]) => tableData.push(row))
        .on('error', reject)
        .on('end', resolve);
    });

    if (tableData.length > 0) {
      sheet.addTable({
        name: 'EdaBulkTable',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: tableData[0].map((header) => ({ name: header, filterButton: true })),
        rows: tableData.slice(1),
      });
      tableData[0].forEach((colName, colIdx) => {
        let maxLen = colName.length;
        tableData.slice(1).forEach((row) => {
          const len = row[colIdx] ? row[colIdx].toString().length : 0;
          if (len > maxLen) maxLen = len;
        });
        sheet.getColumn(colIdx + 1).width = maxLen + 2;
      });
    }

    await workbook.xlsx.writeFile(outFilePathExcel);
    await fsPromise.unlink(tempCsvFilePath);

    await this.bulkEdaRepo.update(
      { id: processId },
      { status: 'finished', outputFile: outFileNameExcel, finishDate: new Date() },
    );

    return processId;
  }

  async download(id: string, type: string): Promise<string> {
    const record = await this.bulkEdaRepo.findOne({
      where: { id, isDeleted: 0 },
      select: { id: true, inputFile: true, outputFile: true, status: true },
    });
    if (!record) {
      throw new NotFoundException(ErrorMessages.EDA_PROCESS_NOT_FOUND);
    }

    if (type === BulkProcessFileType.INPUT) {
      if (!record.inputFile) throw new BadRequestException(ErrorMessages.EDA_PROCESS_NOT_FOUND);
      return join(EDA_INPUT_PATH, record.inputFile);
    }

    if (type === BulkProcessFileType.OUTPUT) {
      if (!record.outputFile) throw new BadRequestException(ErrorMessages.EDA_PROCESS_NOT_FOUND);
      return join(EDA_OUTPUT_PATH, record.outputFile);
    }

    throw new BadRequestException(ErrorMessages.BULK_WRONG_FILE_TYPE);
  }

  async delete(currentUserId: string, processId: string): Promise<string> {
    const record = await this.bulkEdaRepo.findOne({
      where: { id: processId, isDeleted: 0 },
      select: { id: true, createdBy: true, inputFile: true, outputFile: true },
    });
    if (!record || record.createdBy !== currentUserId) {
      throw new BadRequestException(ErrorMessages.EDA_UNAUTHORIZED_NOT_OWNER);
    }

    if (record.inputFile) {
      const inputPath = join(EDA_INPUT_PATH, record.inputFile);
      await fsPromise.unlink(inputPath).catch(() => undefined);
    }
    if (!isUndefinedOrNull(record.outputFile) && record.outputFile) {
      const outputPath = join(EDA_OUTPUT_PATH, record.outputFile);
      await fsPromise.unlink(outputPath).catch(() => undefined);
    }

    await this.bulkEdaRepo.delete({ id: processId });
    return ErrorMessages.EDA_PROCESS_SUCCESSFULLY_DELETED;
  }

  private readCsv<T>(filePath: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const values: T[] = [];
      createReadStream(filePath)
        .pipe(parse({ headers: true }))
        .on('data', (row: T) => values.push(row))
        .on('error', reject)
        .on('end', () => resolve(values));
    });
  }
}
