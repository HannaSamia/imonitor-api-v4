export enum CDRFileType {
  INPUT = 'in',
  OUTPUT = 'out',
}

export enum CdrDecodeStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum CdrFileType {
  SDP = 'SDP',
  AIR = 'AIR',
  CCN = 'CCN',
  TTFILE = 'TTFILE',
  ABMPG = 'ABMPG',
  UNKNOWN = 'UNKNOWN',
}

export type CompressionType = 'zip' | 'gzip';
