/**
 * Customer Care interfaces — mirrors v3 DTOs exactly for backward compatibility.
 */

/** Tabular header (reused from shared) */
export interface TabularHeaderDto {
  header: string;
  field: string;
  cellsalign?: string;
  align?: string;
  filtertype?: string;
  filtercondition?: string;
  columntype?: string;
  [key: string]: unknown;
}

/** AIR XML-RPC request configuration */
export interface CustomerCareXMLRequest {
  AIRServer: string;
  usr: string;
  pass: string;
  homedir: string;
  SDPUSR: string;
  SDPPASS: string;
  ReportDate: string;
  DateTime: string;
  TransID: string;
  Port: number;
  Agent: unknown;
}

/** SDP lookup result */
export interface SdpDto {
  sdpVIP: string;
  sdpId: string;
  sdpName: string;
}

/** Generic customer care response with header + body */
export interface CustomerCareBasicResponse {
  header: TabularHeaderDto[];
  body: unknown[];
}

/** Typed customer care response */
export interface CustomerCareResponse<T> {
  header: TabularHeaderDto[];
  body: T[];
}

/** Hourly balance row */
export interface HourlyBalanceBodyDto {
  dateTime: string;
  balanceNGN: string;
}

/** Daily DA history row */
export interface DailyDaBodyDTO {
  Date: string;
  DA_ID: string;
  DA_Balance: string;
  Expiry_Date: string;
  Acc_in_Euro: string;
  Offer_ID: string;
  Start_Date: string;
  DA_Unit_Type: string;
  DA_Category: string;
  Money_Unit_Sub_Type: string;
  DA_Unit_Balance: string;
  PAM_Service_ID: string;
  Product_ID: string;
}

/** SOB (Service of Breath) result */
export interface SobDto {
  serviceExipryDate: string;
  activationDate: string;
  language: string;
  serviceRemovalDate: string;
  accountGroupId: string;
  supervisionExpiryDate: string;
  SOB: number;
  GDS: string[];
  CUG: number;
  serviceName: string;
  serviceId: string;
  EOCN: number;
  temporaryBlockedFlag: boolean;
  balance: string;
}

/** HLR query result */
export interface HlrResult {
  imsi: number;
  csp: number;
  oick: number;
  apnId: number;
  apnPdpAdd?: string;
  baic?: number;
  baoc?: number;
  obo: number;
  obi: number;
  obp: number;
  obssm: number;
  tick: number;
  ics?: number;
  ts11: number;
  ts21: number;
  ts22: number;
  vlrAddress?: string;
  sgsnNumber?: number;
  vlrData?: string;
  hlrStatus?: string;
}

/** HLR response wrapper */
export interface CustomerCareHlrResponse {
  header: TabularHeaderDto[];
  body: HlrResult[];
}

/** HSS query result */
export interface HssDTO {
  hss_imsi: number;
  hss_profileId: number;
  hss_odb: string;
  epsRoamingAllowed?: boolean;
  epsIndividualDefaultContextId?: number;
  epsIndividualContextId?: number[];
}

/** HSS response wrapper */
export interface CustomerCareHssResponse {
  header: TabularHeaderDto[];
  body: HssDTO[];
}

/** MTAS result */
export interface MtasDTO {
  activated: boolean;
  unconditionalCondition: string;
  cdivActionTarget: string;
  cdivActionNotifyCaller: boolean;
}

/** Offers result */
export interface OffersDTO {
  expiryDate: string;
  offerID: number;
  offerType: number;
  startDate: string;
}

/** Offers response wrapper */
export interface CustomerCareOffersResponse {
  header: TabularHeaderDto[];
  body: OffersDTO[];
}

/** Dedicated accounts result */
export interface DedicatedAccountsDTO {
  dedicatedAccountActiveValue1: number;
  dedicatedAccountID: number;
  dedicatedAccountUnitType: string;
  dedicatedAccountValue1: string;
  expiryDate: string;
  startDate: string;
  composite: number;
  closestExpiryDateTime: string;
  closestExpiryValue1: string;
  description: string;
}

/** Dedicated accounts response wrapper */
export interface CustomerCareDedicatedAccountsResponse {
  header: TabularHeaderDto[];
  body: DedicatedAccountsDTO[];
}

/** AIR downloadable trace result */
export interface AirDownloadableDTO {
  data: string;
  downloadUrl?: string;
}

/** Trace history row */
export interface TraceHistoryDTO {
  id: number;
  status: string;
  node: string;
  phoneNumber: string;
  createdAt: Date;
  createdby: string;
}

/** Text-to-file result (for download endpoints) */
export interface ITextToFile {
  fileName: string;
  content: string;
}

/** CIS HTTP API configuration */
export interface CisHttpDTO {
  UserName: string;
  PassWord: string;
  CertificatePath: string;
  countryCode: string;
  Host: string;
  PortNumber: string;
}

/** MSAP API configuration */
export interface MsapHttpDTO {
  Host: string;
  ApiKey: string;
  PlatformId: string;
  CertificatePath: string;
  RootCertificatePath: string;
}

/** MSAP API response */
export interface MsapApiResponse {
  code: number;
  status: string;
  message?: string;
  transactionId: string;
  requestId?: string;
  data?: Record<string, unknown>[] | Record<string, unknown>;
}

/** Trace system config (SDP/AIR SSH) */
export interface TraceSystemConfigDTO {
  ip_address: string;
  ssh_user: string;
  ssh_pass: string;
  gui_user: string;
  gui_pass: string;
}

/** SFTP connection config */
export interface SftpConfigDTO {
  host: string;
  username: string;
  password: string;
}

/** DAAS CDR detail record */
export interface DaasCdrDaDetail {
  account_id: string;
  amount_before: number;
  amount_after: number;
  amount_charged: number;
}

/** DAAS CDR record */
export interface DaasCdrRecord {
  record_type: string;
  number_called: string;
  event_dt: number | string;
  call_duration_qty: string;
  charged_amount: string;
  balance_after_amt: string;
  balance_before_amt: string;
  discount_amt: string;
  da_amount: string;
  da_details: DaasCdrDaDetail[];
  country: string;
  operator: string;
  bytes_received_qty: number;
  bytes_sent_qty: number;
}

/** DAAS API status */
export interface DaasApiStatus {
  msisdn: string;
  requestId: string;
  dateRange: string[];
  maxRecs: number;
  numRecs: number;
  pageNum: number;
  statusCode: number;
  statusMsg: string;
}

/** DAAS API response */
export interface DaasApiResponse {
  APIStatus: DaasApiStatus;
  APIData: DaasCdrRecord[];
}
