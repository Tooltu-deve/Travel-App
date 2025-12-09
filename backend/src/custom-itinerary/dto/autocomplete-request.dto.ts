import { IsNotEmpty, IsOptional } from 'class-validator';

export class AutocompleteRequestDto {
  @IsNotEmpty()
  input: string;

  @IsOptional()
  sessionToken?: string;
}

