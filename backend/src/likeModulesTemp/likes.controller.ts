import { Controller, Get, Query, Request, UseGuards, Post, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FavoritesService} from './likes.service';

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

  /**
   * Like or unlike a place for the current user
   * @param req - Request object (contains user info)
   * @param body - { google_place_id: string }
   */
  @Post('like-place')
  async likePlace(@Request() req, @Body() body: any) {
    return this.favoritesService.likePlace(req.user.userId, body.google_place_id);
  }

  /**
   * Get all places liked by the current user
   * @param req - Request object (contains user info)
   */
  @Get('liked-places')
  async getLikedPlaces(@Request() req) {
    return this.favoritesService.getLikedPlaces(req.user.userId);
  }
}
