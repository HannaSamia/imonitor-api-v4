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

  // Generic errors (preserving v3 typo for backward compat)
  ERROR_OCCURED: 'an error occured!',
  NOT_FOUND: 'You are lost',
  INTERNAL_ERROR: 'Something went Wrong, please contact the support',
  VALIDATION_ERROR: 'One or More fields are incorrect',
  INVALID_CREDENTIAL: 'Invalid credential',
  INVALID_ID: 'Invalid id',
  FIELD_MISSING: 'Field missing',
} as const;
