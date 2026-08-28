import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Request,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard.js';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginLockGuard } from './login-lock.guard.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(LoginLockGuard, LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: '登录（同 IP 5 次/分；连续失败 5 次锁定 15 分钟）'
  })
  @ApiBody({ type: LoginDto })
  login(
    @Request() req: { user: Awaited<ReturnType<AuthService['validateUser']>> }
  ) {
    return this.auth.login(req.user);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  @ApiOperation({
    summary: '刷新令牌（轮换，旧 refresh 立即失效；同 IP 10 次/分）'
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({ summary: '登出（严格校验：需有效 access；整会话吊销）' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user);
    return null;
  }

  @Get('get-user-info')
  @ApiOperation({ summary: '当前用户信息（实时查库）' })
  getUserInfo(@CurrentUser() user: AuthUser) {
    return this.auth.getUserInfo(user);
  }

  @Get('profile')
  @ApiOperation({ summary: '当前用户个人信息（mine 域，决策 #10）' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user);
  }

  @Get('get-async-routes')
  @ApiOperation({ summary: '角色可见动态路由树' })
  getAsyncRoutes(@CurrentUser() user: AuthUser) {
    return this.auth.getAsyncRoutes(user);
  }
}
