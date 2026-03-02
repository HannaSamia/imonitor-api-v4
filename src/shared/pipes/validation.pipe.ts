import { ValidationPipe, BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Configured global validation pipe.
 * Matches v3's validation error format: { status: 400, message, errors }.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const formattedErrors = errors.map((err) => ({
        field: err.property,
        errors: Object.values(err.constraints || {}),
      }));

      return new BadRequestException({
        status: 400,
        message: 'One or More fields are incorrect',
        errors: formattedErrors,
      });
    },
  });
}
