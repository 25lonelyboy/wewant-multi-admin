import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard.js';
import { LoginLockService } from './login-lock.service.js';
import { LoginLockGuard } from './login-lock.guard.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds }
      })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    LoginLockService,
    LocalStrategy,
    JwtStrategy,
    LocalAuthGuard,
    LoginLockGuard
  ]
})
export class AuthModule {}
