import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GithubConnectDto {
  @ApiProperty({
    description: 'Authorization code from GitHub redirect (?code=)',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class GithubOAuthUrlResponseDto {
  @ApiProperty({
    description: 'Open this URL in the browser to authorize GitHub',
  })
  authorizeUrl!: string;

  @ApiProperty({ description: 'Opaque state — validated on callback' })
  state!: string;
}

export class GithubConnectionResponseDto {
  @ApiProperty()
  githubLogin!: string;

  @ApiProperty()
  connected!: boolean;
}

export class GithubRepoResponseDto {
  @ApiProperty()
  owner!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  defaultBranch!: string;

  @ApiPropertyOptional()
  language?: string;

  @ApiProperty()
  private!: boolean;
}
