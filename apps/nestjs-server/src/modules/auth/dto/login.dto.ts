import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

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
