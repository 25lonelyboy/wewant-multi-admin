import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { LoginRequest } from '@multi-admin/contracts';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: '用户名' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'change_me', description: '密码' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

/** 编译期契约一致性：DTO 形状漂移即编译失败 */
type _LoginDtoSatisfies = LoginDto extends LoginRequest ? true : never;
const _check: _LoginDtoSatisfies = true;
void _check;
