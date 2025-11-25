import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  // GET /favorites/moods
  @Get('moods')
  async getMoods() {
    const moods = await this.favoritesService.getAllMoods();
    return { moods };
  }

  // GET /favorites?mood=...
  @Get()
  async getFavoritesByMood(@Request() req, @Query('mood') mood: string) {
    if (!mood) return [];
    return this.favoritesService.getLikedPlacesByMood(req.user.userId, mood);
  }
}
