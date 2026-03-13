export const SystemKeys = {
  tokenExpiryInMinutes: 'tokenExpiryInMinutes',
  rtokenExpiryInMinutes: 'rtokenExpiryInMinutes',
  utilityApiKey: 'utilityApiKey',
  aesEncryptionKey: 'aesEncryptionKey',
  countryCode: 'country_code',

  // Customer Care — AIR server config
  dateBalancePort: 'air_server_port_dateBalance',
  dateBalanceAgent: 'air_server_dateBalance_agent',
  accumulatorAgent: 'air_server_port_accum_agent',
  accountDetailsAgent: 'air_server_accDet_agent',
  usageAgent: 'air_server_usage_agent',

  // Customer Care — CIS (HLR/HSS/MTAS)
  cisUserName: 'cisUserName',
  cisPassword: 'cisPass',
  cisPort: 'cisPort',
  cisTestPort: 'cisTestPort',
  cisTestHost: 'cisTestHost',
  cisHost: 'cisHost',
  cisCertificateURL: 'cisCertificateURL',

  // Customer Care — MSAP
  msapHost: 'msapHost',
  msapTestHost: 'msapTestHost',
  msapApiKey: 'msapApiKey',
  msapTestApiKey: 'msapTestApiKey',
  msapPlatformId: 'msapPlatformId',
  msapCertificatePath: 'msapCertificatePath',
  msapRootCertificatePath: 'msapRootCertificatePath',
  msapBundleSubscriptionEndpoint: 'msapBundleSubscriptionEndpoint',
  msapVasSubscriptionEndpoint: 'msapVasSubscriptionEndpoint',

  // Customer Care — DAAS (CDR)
  daasHost: 'daasHost',

  // Customer Care — DSM (Share'n'Sell)
  dsmTransactionHistAPI: 'DsmTransactionHistAPI',
  dsmAuthorizationKey: 'DsmAuthorizationKey',

  // Date format (v3 key 'dateFormat1')
  dateFormat1: 'dateFormat1',

  // Bulk Processing — AIR/EDA config (preserving v3 key names exactly)
  bulkProcessAirs: 'bulk_process_ips',
  bulkEdaUser: 'bulk_eda_user',
  bulkEdaPass: 'bulk_eda_pass',
  bulkEdaEndpoint: 'bulk_eda_endpoint',
  airRequestDateFormat: 'air_date_time',
  airRateLimit: 'bulk_air_rate_limit',
  airRateLimitSleep: 'bulk_air_rate_limit_sleep',
  updateSdpMaAmountMultiplier: 'update_sdp_ma_amount_multiplier',
  updateSdpDaAmountMultiplier: 'update_sdp_da_amount_multiplier',

  // Tariff Log — external process service (preserving v3 key names exactly)
  tarrifProcessUrl: 'tarrifProcessUrl',
  tarrifPullProcessUrl: 'tarrifPullProcessUrl',
  tarrifProcessKey: 'TarrifProcessKey',
} as const;
