export enum BulkProcessStatus {
  NOW = 'now',
  PENDING = 'pending',
  PROCESSING = 'processing',
  FINISHED = 'finished',
  INCOMPLETE = 'incomplete',
  FAILED = 'failed',
}

export enum BulkProcessFileType {
  INPUT = 'in',
  OUTPUT = 'out',
}

export enum BulkMethods {
  GET_BALANCE_AND_DATE = 'GetBalanceAndDate',
  UPDATE_BALANCE_MA = 'UpdateBalanceAndDateMA',
  UPDATE_BALANCE_DA = 'UpdateBalanceAndDateDA',
  ADD_OFFER = 'AddOffer',
  REMOVE_OFFER = 'RemoveOffer',
}

export enum BulkMethodsType {
  AIR = 'AIR',
  EDA = 'EDA',
}
