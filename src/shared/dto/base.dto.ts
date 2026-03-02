import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class BodyIdDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class FavoriteDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

export class ShareDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}

export class NodeInfoDto {
  @IsString()
  @IsNotEmpty()
  ip: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SystemConfigDto {
  @IsString()
  @IsNotEmpty()
  confKey: string;

  @IsString()
  @IsNotEmpty()
  confVal: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class RequestArchiveDto {
  type: string;
  endpoint: string;
  userId: string;
  requestDate: string;
  payload: string | null;
  host: string;
}
