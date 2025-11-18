export class SearchByEmotionDto {
  emotions!: string[]; // e.g. ['calm','family']
  mode?: 'any' | 'all';
  limit?: number;
}
