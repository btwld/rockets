import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenaiConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
  readonly maxFiles: number;
  readonly maxTotalChars: number;
  readonly maxFileChars: number;

  constructor() {
    this.apiKey =
      process.env.OPENAI_API_KEY?.trim() ??
      process.env.OPEN_API_KEY?.trim();
    this.model = process.env.OPENAI_MODEL?.trim() ?? 'gpt-4o-mini';
    this.maxFiles = Number(process.env.OPENAI_REVIEW_MAX_FILES ?? '15');
    this.maxTotalChars = Number(
      process.env.OPENAI_REVIEW_MAX_CHARS ?? '80000',
    );
    this.maxFileChars = Number(
      process.env.OPENAI_REVIEW_MAX_FILE_CHARS ?? '8000',
    );
  }

  get isEnabled(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }
}
