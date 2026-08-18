import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: '登录返回的 refreshToken' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
