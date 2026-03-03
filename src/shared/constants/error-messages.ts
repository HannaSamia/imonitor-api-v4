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

  // Generic errors
  NOT_FOUND: 'You are lost',
  INTERNAL_ERROR: 'Something went Wrong, please contact the support',
  VALIDATION_ERROR: 'One or More fields are incorrect',
  INVALID_CREDENTIAL: 'Invalid credential',
  INVALID_ID: 'Invalid id',
  FIELD_MISSING: 'Field missing',
} as const;
