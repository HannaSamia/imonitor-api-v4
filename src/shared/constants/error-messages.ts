export const ErrorMessages = {
  // Auth errors (matching v3 baseMessages exactly — including original typos)
  JWT_IS_NOT_VALID: 'Invalid access token.',
  REFRESH_TOKEN_INVALID: 'Invalid Token.',
  UNAUTHORIZED: 'Your unauthorized!',
  UNAUTHORIZED_ROLE: "You don't have the privilige to access this request.",
  API_KEY_INVALID: 'Invalid api key',
  INVALID_CREDENTIALS: 'Invalid user credentials!',
  ACCOUNT_LOCKED: 'This account is currently locked !',
  TOKEN_HAS_NOT_EXPIRED_YET: "Your token hasn't expired yet!",
  ONLY_ONE_SESSION_ALLOWED: 'Only one session is allowed.',

  // User errors
  USER_NOT_FOUND: 'User not found.',
  USER_ALREADY_EXISTS: 'User already exists.',
  EMAIL_ALREADY_EXISTS: 'Email already exists.',
  ROLE_NOT_FOUND: 'Role not found.',
  MODULE_NOT_FOUND: 'Module not found.',
  PASSWORD_MISMATCH: 'Passwords do not match.',
  WRONG_PASSWORD: 'Wrong password.',

  // Auth success messages (matching v3 baseMessages exactly)
  LOGIN_SUCCESS: 'You are logged in',
  LOGOUT_SUCCESSFUL: 'LOUGOUT_SUCCESSFUL',
  REFRESH_TOKEN_SUCCESS: 'Token refreshed successfuly.',
  HEARTBEAT: 'HEARTBEAT',
  HAS_ACCESS_PRIVILEGE: 'HAS_ACCESS_PRIVILIGE',

  // Report errors (preserving v3 messages exactly)
  REPORT_DOES_NOT_EXIST: 'Report does not exist',
  SHARED_REPORT_DOES_NOT_EXIST: 'Shared report does not exist',
  REPORT_DOES_NOT_HAVE_MODULES: 'Report does not have moduleIds',
  ERROR_WHILE_SAVING_REPORT: 'Error occured while saving the report',
  USER_ALREADY_OWNS_REPORT: 'You already own this report!',
  REPORT_IS_BEING_USED_IN_DATA_ANALYSIS: 'This report is being used is the following Data Analysis: ',
  REPORT_SUCCESSFULLY_DELETED: 'Report successfully deleted',
  REPORT_OWNER_UPDATED: 'Report owner successfully updated',
  REPORT_NAME_UPDATED: 'Report name successfully updated',
  NO_PRIVILEGED_TABLES: 'You have no privilege on any view!',
  USER_NOT_PRIVILEGED_TO_SAVE: 'You are not privileged to save!',
  ERROR_SHARE: 'Error occured durring the share process',
  ERROR_UPDATE: 'Error occured durring the update process',
  ERROR_DELETE: 'Error occured durring the delete process',
  ACCESS_DENIED: "You don't have access to this widget Builder",
  CHART_ERROR_DEFAULT: 'Operation failed, chart used in system and cannot be modified',

  // Widget builder errors (preserving v3 widgetBuilderErrorMessages)
  WIDGET_BUILDER_DOES_NOT_EXIST: 'Widget Builder does not exist',
  SHARED_WIDGET_BUILDER_DOES_NOT_EXIST: 'Shared Widget Builder does not exist',
  WIDGET_DOES_NOT_HAVE_MODULES: 'Widget Builder does not have moduleIds',
  ERROR_WHILE_SAVING_WIDGETBUILDER: 'Error occured while saving the Widget Builder',
  USER_ALREADY_OWNS_WIDGET_BUILDER: 'You already own this Widget Builder!',
  WIDGET_BUILDER_IS_BEING_USED_IN_THE_FOLLOWING_DASHBOARDS:
    'This widget builder is being used in the following dashboards: ',
  WIDGET_BUILDER_DELETED: 'Widget Builder successfully deleted',
  WIDGET_OWNER_UPDATED: 'Widget Builder owner successfully updated',
  WIDGET_BUILDER_NAME_UPDATED: 'Widget Builder name successfully updated',

  // Chart generation errors (preserving v3 chartsErrorMessages)
  CHART_FIELD_IS_MISSING: 'Make sure the necessary fields are selected',
  CHART_CANNOT_FIND_FIELD: 'Field could not be found',
  CHART_TREND_WITHOUT_COMPARE: 'Cannot use compare column without stat date in trend',
  CHART_NO_NUMBER_FIELD: 'Please choose a numeric field',
  CHART_EXPLODE_FIELD_ERROR: 'Make sure to use the correct field type for the explode',
  CHART_DUPLICATE_FIELD: 'Duplicate fields detected, please make sure to choose unique fields',
  CHART_TREND_ERROR: 'Error during trend chart construction',
  CHART_HOT_KEY_ERROR: 'Error during text transformation process',
  CHART_GENERATE_ERROR: 'error generating the charts',

  // Dashboard errors (preserving v3 dashboardErrorMessages)
  DASHBOARD_DOES_NOT_EXIST: 'Dashboard does not exist',
  SHARED_DAHBOARD_DOES_NOT_EXIST: 'Shared Dashboard does not exist',
  DASHBOARD_NOT_DEFAULT: 'Dashboard is not a default dashboard',
  IDS_NOT_MATCHING: 'Ids are not matching',
  ERROR_SAVE: 'Error occured durring the save process',

  // Rotating dashboard errors (preserving v3 rotatingDashboardErrorMessages)
  ROTATING_DASHBOARD_DOES_NOT_EXIST: 'Rotating dashboard does not exist',
  CANNOT_SHARE_ROTATING_CONTAINING_SHARED: "you can't share a rotating dashboard containing shared dashboard",
  ROTATING_DASHBOARD_SUCCESSFULLY_DELETED: 'Rotating dashboard successfully deleted.',

  // Data analysis errors (preserving v3 dataAnalysisErrorMessages)
  DATA_ANALYSIS_DOES_NOT_EXIST: 'Data analysis does not exist',
  SHARED_DATA_ANALYSIS_DOES_NOT_EXIST: 'Shared Data analysis does not exist',
  INVALID_DATA_ANALYSIS_STATUS: 'Invalid data analysis status',
  DATA_ANALYSIS_NOT_DEFAULT: "This data Analysis isn't default",
  DUPLICATE_CHART_ERROR: 'Error while creating the charts',

  // Widget Builder errors (preserving v3 messages for backward compat)
  WIDGET_BUILDER_NOT_FOUND: 'Widget builder does not exist',
  SHARED_WIDGET_BUILDER_NOT_FOUND: 'Shared widget builder does not exist',
  CHART_NOT_FOUND: 'Report chart does not exist',

  // Observability errors (preserving v3 ObservabilityErrorMessages)
  METRIC_DOES_NOT_EXIST: 'Metric does not exist',
  DEFAULT_METRIC_NOT_SELECTED: 'Default metric not selected',
  OB_CHART_DOES_NOT_EXIST: 'Observability chart does not exist',
  OB_DASHBOARD_DOES_NOT_EXIST: 'Observability dashboard does not exist',
  CHART_NOT_EXISTS: 'Chart does not exist',
  EXPLODED_STATUS_CHANGED: 'Cannot change exploded status when charts exist',

  // Connectivity errors
  CONNECTIVITY_ERROR: 'Error fetching connectivity data',

  // Notification errors
  NOTIFICATION_SETTING_NOT_FOUND: 'Notification setting not found',
  NOTIFICATION_NOT_FOUND: 'Notification not found',

  // Authorization errors
  UNAUTHORIZED_ACTION: 'You are not authorized to perform this action.',

  // Customer Care errors (preserving v3 customerCareErrorMessages)
  CC_SDP_WRONG_NUMBER: 'Please make sure you enter correct number',
  CC_DATA_PARSING: 'Data parsing failed',
  CC_NO_HOURLY_BALANCE_ON_DATE: 'No balance history on this date!',
  CC_NO_HOURLY_BALANCE_ON_NUMBER: 'No balance history for phone number on this date!',
  CC_NO_DA_DAILY_BALANCE_ON_DATE: 'No dedicated accounts balance history on this date!',
  CC_NO_DA_DAILY_BALANCE_ON_NUMBER: 'No dedicated accounts balance history for phone number on this date!',
  CC_NO_SUBSCRIPTION_HISTORY: 'No subscription history records found on this date!',
  CC_ERROR_SETTING_TRACE: 'Trace not set!',
  CC_ERROR_UNSETTING_TRACE: "Couldn't unset trace!",
  CC_NO_TRACE_FOUND: 'No trace was found!',
  CC_TRACE_DATA_FAILURE: 'Failed to fetch the trace data',
  CC_EMPTY_RESPONSE: 'An empty response was received',
  CC_ERROR_FROM_HOST: 'Received error from host',
  CC_SSH_FAILED: 'SSH connection failed to ',
  CC_SDP_PATH_NOT_FOUND: 'the sdpstats directory was not found on ',
  CC_SELL_N_SHARE_FAIL: 'Failed to send the sell N share history request',
  CC_HLR_FAIL: 'Failed to send hlr request',
  CC_HSS_FAIL: 'Failed to send hss request',
  CC_MTAS_FAIL: 'Failed to send mtas request',
  CC_PAM_DATA_NOT_FOUND: 'PAM informations not found',
  CC_DEDICATED_ACCOUNTS_NOT_FOUND: 'Dedicated Accounts informations not found',
  CC_OFFERS_NOT_FOUND: 'Offers informations not found',
  CC_ACCUMULATORS_NOT_FOUND: 'Accumulators informations not found',
  CC_USAGE_COUNTER_NOT_FOUND: 'Usage Counter informations not found',
  CC_USAGE_THRESHOLD_NOT_FOUND: 'Usage Threshold informations not found',
  CC_AIR_PATH_NOT_FOUND: 'The airStats path was not found on all nodes',
  CC_SFTP_UPLOAD_FAILED: 'Failed to upload the files using sftp',
  CC_SFTP_SSH_FAILED: "Failed to access all the AIR's",
  CC_MISSING_SDP_VIP_CONFIG: 'Missing sdp vip configuration',
  CC_TRACE_TOO_LARGE: 'Trace too large to export as HTML. Please use the download link instead.',

  // Customer Care success messages (preserving v3 successMessages)
  CC_SDP_SUCCESS: 'SDP successfully retrived',
  CC_DEDICATED_ACCOUNT_SUCCESS: 'Dedicated accounts successfully retrived',
  CC_OFFERS_SUCCESS: 'Offers successfully retrived',
  CC_ACCUMULATORS_SUCCESS: 'Accumulators successfully retrived',
  CC_PAM_SUCCESS: 'Pam successfully retrived',
  CC_USAGE_COUNTER_SUCCESS: 'Usage counter successfully retrived',
  CC_USAGE_THRESHOLD_SUCCESS: 'Usage threshold successfully retrived',
  CC_SOB_SUCCESS: 'SOB successfully retrived',
  CC_HLR_SUCCESS: 'HLR successfully retrived',
  CC_HSS_SUCCESS: 'HSS successfully retrived',
  CC_HOURLY_BALANCE_SUCCESS: 'Hourly balance successfully retrived',
  CC_DAILY_BALANCE_SUCCESS: 'Daily da balance successfully retrived',
  CC_SUBHISTORY_SUCCESS: 'Subcription history successfully retrived',
  CC_TRACE_SET: 'Trace set successfully',
  CC_TRACE_UNSET: 'Trace unset successfully',
  CC_TRACE_RETRIEVED: 'Trace retrived successfully',

  // Bulk Processing errors (preserving v3 bulkProcessMessages)
  BULK_FILE_NOT_SUPPORTED: 'The uploaded file type is not supported',
  BULK_PROCESS_ADD_ERROR: 'Error while registering the bulk process',
  BULK_PROCESS_WORKER_FAILED: 'Error during the file processing',
  BULK_WRONG_FILE_TYPE: 'Download error, wrong file type selected',
  BULK_PROCESS_NOT_FOUND: 'Bulk process not found',
  BULK_PROCESS_NOT_FINISHED: 'Please wait until the bulk process is finished',
  BULK_PROCESS_DOWNLOAD_FAILED: 'File download faild',
  BULK_UPDATE_NOT_PENDING: 'None pending processes cannot be updated',
  BULK_WAIT_TILL_FINISHED: 'Please wait until the process is finished',
  BULK_NO_AIR_NODES: 'No air nodes selected',
  BULK_INCORRECT_CSV_HEADERS: 'Incorrect csv headers',

  // Bulk EDA Report errors (preserving v3 bulkEdaReportErrorMessages / successMessages)
  EDA_PROCESS_NOT_FOUND: 'Eda process not found',
  EDA_UPLOAD_FAILED_MAX_50_ROWS: 'upload failed, max 50 rows',
  EDA_UNAUTHORIZED_NOT_OWNER: 'unauthorized, you are not the owner of this report',
  EDA_PROCESS_SUCCESSFULLY_CREATED: 'eda process was successfully created',
  EDA_PROCESS_SUCCESSFULLY_DELETED: 'eda process was successfully deleted',

  // CDR Decoder errors (preserving v3 CdrDecodeErrorMessages)
  CDR_FAILED_TO_DECODE: 'Failed to decode file',
  CDR_PROCESS_NOT_FOUND: 'Process not found',
  CDR_FILE_NOT_FOUND: 'File not found',
  CDR_FILE_UNAVAILABLE: 'Decoded file not available - process not completed',
  CDR_FAILED_DELETE_RUNNING: 'Cannot delete while process is running',
  CDR_INVALID_FILE_FORMAT: 'Invalid file format. Only .zip and .gz files are accepted',

  // Bill Run errors (preserving v3 BillRunErrorMessages)
  BILLRUN_ONLY_CSV: 'Only CSV files are supported',
  BILLRUN_INVALID_MSISDNS: 'No valid MSISDNs found in CSV. Expected header: msisdn_key',
  BILLRUN_NOT_FOUND: 'Bill run process not found',
  BILLRUN_NOT_COMPLETED: 'Output file not available, process not completed',
  BILLRUN_FILE_UNAVAILABLE: 'File not available',
  BILLRUN_FILE_NOT_FOUND: 'File not found on disk',
  BILLRUN_DELETE_RUNNING: 'Cannot delete a process that is still running',

  // Tariff Log errors (preserving v3 tarrifLogsMessages — note: typos preserved)
  TARRIF_CANNOT_CHOOSE_FUTURE_DATE: 'invalid date, you cannot choose a date bigger that the current one',
  TARRIF_TRIGGER_PROCESS_ERROR: 'Error while triggering the process',
  TARRIF_NOT_FOUND: 'Tarrif process not found',
  TARRIF_WAIT_TILL_FINISHED: 'Please wait until the process is finished',
  TARRIF_FILE_NOT_FOUND_WAIT: 'Recreating Tarrif result, please wait',
  TARRIF_NOT_CORRECT: 'The selected tarrif is incorrect',
  TARRIF_SAME_DATE: 'You cannot compare the same dates',

  // Generic errors (preserving v3 typo for backward compat)
  ERROR_OCCURED: 'an error occured!',
  NOT_FOUND: 'You are lost',
  INTERNAL_ERROR: 'Something went Wrong, please contact the support',
  VALIDATION_ERROR: 'One or More fields are incorrect',
  INVALID_CREDENTIAL: 'Invalid credential',
  INVALID_ID: 'Invalid id',
  FIELD_MISSING: 'Field missing',
} as const;
