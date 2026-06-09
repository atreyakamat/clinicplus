import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { extractPermissionNames, extractRoleNames } from '../access.utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findByEmail(payload.email);
    if (!user) {
      return null;
    }

    const roles = payload.roles?.length
      ? payload.roles
      : extractRoleNames(user.roles);
    const permissions = payload.permissions?.length
      ? payload.permissions
      : extractPermissionNames(user.roles);

    return {
      id: user.id,
      email: user.email,
      roles,
      permissions,
      organizationId: user.organizationId,
      branchId: user.branchId,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
