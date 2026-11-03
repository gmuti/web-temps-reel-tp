import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { createUserInputSchema, loginInputSchema, type CreateUserInput, type LoginInput } from '@app/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body(new ZodValidationPipe(createUserInputSchema)) body: CreateUserInput) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginInputSchema)) body: LoginInput) {
    return this.auth.login(body);
  }
}
