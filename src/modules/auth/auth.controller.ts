import { Controller, Post, Get, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ErrorMessages } from '../../shared/constants';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, CanAccessModuleDto } from './dto';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username/email and password' })
  async login(@Body() body: LoginDto) {
    const result = await this.authService.login(body);
    return { message: ErrorMessages.LOGIN_SUCCESS, result };
  }

  @Post('token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT token' })
  async refreshToken(@Body() body: RefreshTokenDto) {
    const result = await this.authService.refreshToken(body);
    return { message: ErrorMessages.REFRESH_TOKEN_SUCCESS, result };
  }

  @Post('token/timer')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT token (timer endpoint)' })
  async refreshTokenTimer(@Body() body: RefreshTokenDto) {
    const result = await this.authService.refreshToken(body);
    return { message: ErrorMessages.REFRESH_TOKEN_SUCCESS, result };
  }

  @Get('logout')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Headers('authorization') authHeader: string, @CurrentUser('id') userId: string) {
    const token = authHeader?.replace('Bearer ', '') ?? '';
    await this.authService.logout(token, userId);
    return { message: ErrorMessages.LOGOUT_SUCCESSFUL, result: null };
  }

  @Get('heartbeat')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Check token validity (heartbeat)' })
  heartbeat(@CurrentUser('id') userId: string) {
    return { message: ErrorMessages.HEARTBEAT, result: userId };
  }

  @Post('access')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if user can access module with role' })
  async canAccessModule(@CurrentUser('id') userId: string, @Body() body: CanAccessModuleDto) {
    await this.authService.canAccessModule(userId, body);
    return { message: ErrorMessages.HAS_ACCESS_PRIVILEGE, result: null };
  }
}
