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
} as const;
