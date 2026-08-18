import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../../config/app-config.service.js';
import { AuthService } from '../auth.service.js';

interface AccessPayload {
  sub: string;
  username: string;
  sid: string;
  jti: string;
  exp: number;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly auth: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtAccessSecret
    });
  }

  /** type 强校验防 access/refresh 互串；黑名单与查库委派 AuthService */
  validate(payload: AccessPayload) {
    if (payload.type !== 'access') {
      throw new Error('invalid token type');
    }
    return this.auth.resolveSessionUser(payload);
  }
}
