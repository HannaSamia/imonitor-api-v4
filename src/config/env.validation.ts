import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Database
  DB_HOST: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_PORT: Joi.number().default(3306),
  DB_LIMIT_USER: Joi.string().required(),
  DB_LIMIT_PASSWORD: Joi.string().allow('').required(),

  // Database names
  coreDbName: Joi.string().default('`iMonitorV3_1`'),
  dataDbName: Joi.string().default('`iMonitorData`'),
  etlDbName: Joi.string().default('`EtlV3_2`'),

  // Application
  PORT: Joi.number().default(5011),
  CPUS: Joi.number().default(1),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // Authentication
  JWT_KEY: Joi.string().required(),

  // Email
  MAIL_HOST: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),
  MAIL_AUTH_EMAIL: Joi.string().required(),
  MAIL_AUTH_PASSWROD: Joi.string().required(), // Note: typo preserved from v3 for compatibility

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // Rate Limiting
  NB_OF_REQUESTS: Joi.number().default(200),
  RATE_LIMIT_DURATION_SEC: Joi.number().default(60),
  RATE_BLOCK_DURATION: Joi.number().default(180),
});
