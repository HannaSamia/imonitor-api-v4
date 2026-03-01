# TypeScript Style Guide

## General

- Use TypeScript standard mode (not strict — per project decision).
- Prefer explicit types over `any`. Use `unknown` when the type is truly unknown.
- Use interfaces for object shapes, type aliases for unions/intersections.
- Use enums for fixed sets of values; prefer string enums for readability.

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `user.service.ts`, `auth.guard.ts` |
| Classes | PascalCase | `UserService`, `JwtAuthGuard` |
| Interfaces | PascalCase (no `I` prefix) | `UserResponse`, `CreateUserDto` |
| Variables/Functions | camelCase | `getUserById`, `isActive` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE` |
| Enums | PascalCase (members: PascalCase) | `UserRole.SuperAdmin` |
| DTOs | PascalCase with Dto suffix | `CreateUserDto`, `UpdateReportDto` |
| Entities | PascalCase with Entity suffix | `UserEntity`, `ReportEntity` |

## NestJS Conventions

### Module Structure

```
src/modules/<module-name>/
  <module-name>.module.ts
  <module-name>.controller.ts
  <module-name>.service.ts
  dto/
    create-<name>.dto.ts
    update-<name>.dto.ts
  entities/
    <name>.entity.ts
  <module-name>.controller.spec.ts
  <module-name>.service.spec.ts
```

### Controllers

- Keep controllers thin — HTTP concerns only.
- Use decorators for routing, validation, and documentation.
- Return DTOs, not raw entities.
- Use `@ApiTags`, `@ApiOperation`, `@ApiResponse` for Swagger.

### Services

- Contain all business logic.
- Inject repositories and other services via constructor DI.
- Throw NestJS HttpExceptions (not custom error classes).
- One public method per logical operation.

### DTOs

- Use `class-validator` decorators on all DTO properties.
- Use `class-transformer` for transformation (`@Exclude`, `@Expose`, `@Transform`).
- Separate Create and Update DTOs (Update can use `PartialType`).

### Entities

- Match database schema exactly (from db.sql).
- Use TypeORM decorators: `@Entity`, `@Column`, `@PrimaryColumn`, `@ManyToOne`, etc.
- Preserve original column names including typos (e.g., `core_connectifity_notifications`).
- Set `synchronize: false` — entities are descriptive, not prescriptive.

## Imports

- Use absolute imports with path aliases (`@modules/`, `@shared/`, `@common/`).
- Group imports: NestJS → third-party → internal.
- No barrel exports (index.ts re-exports) unless for module public API.

## Error Handling

- Use NestJS built-in exceptions: `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`.
- Global exception filter handles all unhandled errors.
- Never swallow errors silently — log at minimum.

## Async/Await

- Always use `async/await` — no raw Promise chains.
- Handle errors with try/catch at the service layer.
- Use `Promise.all()` for independent parallel operations.

## Comments

- Only add comments where the logic is not self-evident.
- Use JSDoc for public service methods and controller endpoints.
- No commented-out code in committed files.
