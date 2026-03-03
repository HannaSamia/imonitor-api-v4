import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { UsersService } from './users.service';
import { UserPrivilegesService } from './user-privileges.service';
import { UserPasswordService } from './user-password.service';
import {
  CreateUserDto,
  UpdateUserDto,
  EditSelfDto,
  ChangePasswordDto,
  ChangeThemeDto,
  UserPrivilegesDto,
  BodyIdDto,
} from './dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(PrivilegeGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userPrivilegesService: UserPrivilegesService,
    private readonly userPasswordService: UserPasswordService,
  ) {}

  // ─── CRUD Endpoints ──────────────────────────────────────────────────

  /** Returns 200 instead of 201 for v3 frontend parity. */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() body: CreateUserDto, @CurrentUser('id') userId: string) {
    const result = await this.usersService.register(body, userId);
    return { message: 'User registered successfully.', result };
  }

  @Get()
  @ApiOperation({ summary: 'Get all users (excluding current)' })
  async usersWithoutCurrent(@CurrentUser('id') userId: string) {
    const result = await this.usersService.getAll(true, userId);
    return { result };
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all users' })
  async users() {
    const result = await this.usersService.getAll();
    return { result };
  }

  @Get('emails')
  @ApiOperation({ summary: 'Get all user emails' })
  async userEmails() {
    const result = await this.usersService.getEmails();
    return { result };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser('id') userId: string) {
    const result = await this.usersService.getUserById(userId);
    return { result };
  }

  @Get('sidemenu')
  @ApiOperation({ summary: 'Get side menu for current user' })
  async sideMenu(@CurrentUser() user: JwtPayload) {
    const result = await this.userPrivilegesService.getSideMenu(user.id, user.theme);
    return { result };
  }

  @Get('module/:name/role')
  @ApiOperation({ summary: 'Get user role on a specific module' })
  async moduleRole(@CurrentUser('id') userId: string, @Param('name') name: string) {
    const result = await this.userPrivilegesService.getUserRoleOnModule(userId, name);
    return { result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUser(@Param('id') id: string) {
    const result = await this.usersService.getUserById(id);
    return { result };
  }

  // ─── Account Management Endpoints ────────────────────────────────────

  @Put('theme')
  @ApiOperation({ summary: 'Update current user theme' })
  async theme(@CurrentUser('id') userId: string, @Body() body: ChangeThemeDto) {
    await this.usersService.themeUpdate(userId, body.theme);
    return { result: null };
  }

  @Put()
  @ApiOperation({ summary: 'Edit own profile' })
  async editSelf(@CurrentUser('id') userId: string, @Body() body: EditSelfDto) {
    await this.usersService.selfUpdate(userId, body);
    return { result: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Admin update another user' })
  async updateOtherUser(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @Body() body: UpdateUserDto,
  ) {
    await this.usersService.update(id, currentUserId, body);
    return { result: null };
  }

  @Put(':id/privileges')
  @ApiOperation({ summary: 'Update user privileges' })
  async updatePrivileges(@Param('id') id: string, @Body() body: UserPrivilegesDto[]) {
    await this.userPrivilegesService.updateUserPrivileges(id, body);
    return { result: null };
  }

  @Put(':id/lock')
  @ApiOperation({ summary: 'Lock a user account' })
  async lockUser(@Param('id') id: string, @CurrentUser('id') currentUserId: string, @Body() _body: BodyIdDto) {
    await this.usersService.lock(currentUserId, id);
    return { result: null };
  }

  @Put(':id/unlock')
  @ApiOperation({ summary: 'Unlock a user account' })
  async unlockUser(@Param('id') id: string, @CurrentUser('id') currentUserId: string, @Body() _body: BodyIdDto) {
    await this.usersService.unlock(currentUserId, id);
    return { result: null };
  }

  // ─── Password Endpoints ──────────────────────────────────────────────

  @Patch('resetpassword')
  @ApiOperation({ summary: 'Change own password' })
  async changePassword(@CurrentUser('id') userId: string, @Body() body: ChangePasswordDto) {
    await this.userPasswordService.changePassword(userId, body);
    return { result: null };
  }

  @Patch('changepassword/:id')
  @ApiOperation({ summary: 'Admin reset another user password' })
  async resetPassword(@Param('id') id: string, @CurrentUser('id') currentUserId: string) {
    await this.userPasswordService.resetPassword(currentUserId, id);
    return { result: null };
  }

  // ─── Delete ──────────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a user' })
  async deleteUser(@Param('id') id: string, @CurrentUser('id') currentUserId: string) {
    await this.usersService.delete(currentUserId, id);
    return { result: null };
  }

  // ─── Privileges ──────────────────────────────────────────────────────

  @Get(':id/privileges')
  @ApiOperation({ summary: 'Get user privileges tree' })
  async getUserPrivileges(@Param('id') id: string) {
    const result = await this.userPrivilegesService.getUserPrivileges(id);
    return { result };
  }
}
