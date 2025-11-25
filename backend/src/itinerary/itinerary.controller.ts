import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Patch,
  Query,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ItineraryService } from './itinerary.service';
import { GenerateRouteDto } from './dto/generate-route.dto';
import { UpdateItineraryStatusDto } from './dto/update-itinerary-status.dto';
import { ItineraryResponseDto } from './dto/itinerary-response.dto';

@Controller('itineraries')
export class ItineraryController {
  constructor(private readonly itineraryService: ItineraryService) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateRoute(
    @Request() req,
    @Body() generateDto: GenerateRouteDto,
  ): Promise<{
    message: string;
    route: ItineraryResponseDto;
  }> {
    const userId = req.user.userId;
    const savedRoute = await this.itineraryService.generateAndSaveRoute(
      userId,
      generateDto,
    );

    return {
      message:
        'Lộ trình đã được tạo và lưu với trạng thái DRAFT. Vui lòng xác nhận để lưu chính thức.',
      route: this.mapToResponse(savedRoute),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':routeId/status')
  @HttpCode(HttpStatus.OK)
  async updateRouteStatus(
    @Request() req,
    @Param('routeId') routeId: string,
    @Body() updateDto: UpdateItineraryStatusDto,
  ): Promise<{
    message: string;
    route: ItineraryResponseDto;
  }> {
    const userId = req.user.userId;
    const updatedRoute = await this.itineraryService.updateStatus(
      routeId,
      userId,
      updateDto.status,
      { title: updateDto.title },
    );

    if (!updatedRoute) {
      throw new NotFoundException(
        'Không tìm thấy lộ trình hoặc bạn không có quyền cập nhật lộ trình này.',
      );
    }

    return {
      message: `Lộ trình đã được cập nhật trạng thái thành ${updateDto.status}.`,
      route: this.mapToResponse(updatedRoute),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserRoutes(
    @Request() req,
    @Query('status') status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
  ): Promise<{
    message: string;
    routes: ItineraryResponseDto[];
    total: number;
  }> {
    const userId = req.user.userId;
    const routes = await this.itineraryService.findByUserId(userId, status);
    const routesResponse = routes.map((route) => this.mapToResponse(route));

    return {
      message: `Đã tìm thấy ${routesResponse.length} lộ trình${
        status ? ` với status ${status}` : ''
      }.`,
      routes: routesResponse,
      total: routesResponse.length,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':routeId')
  @HttpCode(HttpStatus.OK)
  async getRouteById(
    @Request() req,
    @Param('routeId') routeId: string,
  ): Promise<{
    message: string;
    route: ItineraryResponseDto;
  }> {
    const userId = req.user.userId;
    const route = await this.itineraryService.findByRouteId(routeId);

    if (!route || route.user_id.toString() !== userId) {
      throw new NotFoundException('Không tìm thấy lộ trình.');
    }

    return {
      message: 'Đã tìm thấy lộ trình.',
      route: this.mapToResponse(route),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':routeId')
  @HttpCode(HttpStatus.OK)
  async deleteDraftRoute(
    @Request() req,
    @Param('routeId') routeId: string,
  ): Promise<{
    message: string;
  }> {
    const userId = req.user.userId;
    const deleted = await this.itineraryService.deleteDraftRoute(
      routeId,
      userId,
    );

    if (!deleted) {
      throw new NotFoundException(
        'Không tìm thấy lộ trình DRAFT hoặc bạn không có quyền xóa lộ trình này.',
      );
    }

    return {
      message: 'Lộ trình DRAFT đã được xóa thành công.',
    };
  }

  private mapToResponse(route: any): ItineraryResponseDto {
    const routeObject = route?.toObject ? route.toObject() : { ...route };
    return {
      route_id: routeObject.route_id,
      user_id: routeObject.user_id.toString(),
      created_at: routeObject.created_at,
      title: routeObject.title,
      destination: routeObject.destination,
      duration_days: routeObject.duration_days,
      start_datetime: routeObject.start_datetime || null,
      status: routeObject.status,
      route_data_json: routeObject.route_data_json,
      id: routeObject._id.toString(),
    };
  }
}

