import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt-payload.type.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
