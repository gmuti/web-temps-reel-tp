import { Module } from '@nestjs/common';
import { PasswordService } from './password.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService, PasswordService],
  exports: [UsersService, PasswordService],
})
export class UsersModule {}
