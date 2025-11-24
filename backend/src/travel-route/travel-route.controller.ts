import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Query,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TravelRouteService } from './travel-route.service';
import { CreateTravelRouteDto } from './dto/create-travel-route.dto';
import { GenerateRouteDto } from './dto/generate-route.dto';
import { UpdateRouteStatusDto } from './dto/update-route-status.dto';
import { TravelRouteResponseDto } from './dto/travel-route-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('routes')
@UseGuards(JwtAuthGuard) // Yêu cầu JWT authentication
export class TravelRouteController {
  constructor(private readonly travelRouteService: TravelRouteService) {}

  /**
   * POST /routes/generate
   * Flow hoàn chỉnh:
   * 1. Lọc POI từ database (theo budget và destination)
   * 2. Gọi AI Optimizer Service để tối ưu
   * 3. Enrich với Directions API (thêm polyline và duration)
   * 4. Lưu vào database với status DRAFT
   * 5. Trả về cho frontend
   */
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateRoute(
    @Request() req,
    @Body() generateDto: GenerateRouteDto,
  ): Promise<{
    message: string;
    route: TravelRouteResponseDto;
  }> {
    const userId = req.user.userId;

    // Backend thực hiện toàn bộ flow: lọc POI → tối ưu → enrich → lưu
    const savedRoute = await this.travelRouteService.generateAndSaveRoute(
      userId,
      generateDto,
    );

    // Convert to plain object
    const routeObject = savedRoute.toObject
      ? savedRoute.toObject()
      : { ...savedRoute };

    return {
      message: 'Lộ trình đã được tạo và lưu với trạng thái DRAFT. Vui lòng xác nhận để lưu chính thức.',
      route: {
        route_id: routeObject.route_id,
        user_id: routeObject.user_id.toString(),
        created_at: routeObject.created_at,
        status: routeObject.status,
        route_data_json: routeObject.route_data_json,
        id: routeObject._id.toString(),
      },
    };
  }

  /**
   * PATCH /routes/:routeId/status
   * Cập nhật status của lộ trình (ví dụ: từ DRAFT → CONFIRMED khi user xác nhận)
   */
  @Patch(':routeId/status')
  @HttpCode(HttpStatus.OK)
  async updateRouteStatus(
    @Request() req,
    @Param('routeId') routeId: string,
    @Body() updateDto: UpdateRouteStatusDto,
  ): Promise<{
    message: string;
    route: TravelRouteResponseDto;
  }> {
    const userId = req.user.userId;

    const updatedRoute = await this.travelRouteService.updateStatus(
      routeId,
      userId,
      updateDto.status,
    );

    if (!updatedRoute) {
      throw new NotFoundException(
        'Không tìm thấy lộ trình hoặc bạn không có quyền cập nhật lộ trình này.',
      );
    }

    // Convert to plain object
    const routeObject = updatedRoute.toObject
      ? updatedRoute.toObject()
      : { ...updatedRoute };

    return {
      message: `Lộ trình đã được cập nhật trạng thái thành ${updateDto.status}.`,
      route: {
        route_id: routeObject.route_id,
        user_id: routeObject.user_id.toString(),
        created_at: routeObject.created_at,
        status: routeObject.status,
        route_data_json: routeObject.route_data_json,
        id: routeObject._id.toString(),
      },
    };
  }

  /**
   * GET /routes
   * Lấy tất cả lộ trình của user (có thể filter theo status)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserRoutes(
    @Request() req,
    @Query('status') status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
  ): Promise<{
    message: string;
    routes: TravelRouteResponseDto[];
    total: number;
  }> {
    const userId = req.user.userId;

    const routes = await this.travelRouteService.findByUserId(userId, status);

    const routesResponse = routes.map((route) => {
      const routeObject = route.toObject ? route.toObject() : { ...route };
      return {
        route_id: routeObject.route_id,
        user_id: routeObject.user_id.toString(),
        created_at: routeObject.created_at,
        status: routeObject.status,
        route_data_json: routeObject.route_data_json,
        id: routeObject._id.toString(),
      };
    });

    return {
      message: `Đã tìm thấy ${routesResponse.length} lộ trình${status ? ` với status ${status}` : ''}.`,
      routes: routesResponse,
      total: routesResponse.length,
    };
  }

  /**
   * GET /routes/:routeId
   * Lấy chi tiết một lộ trình theo routeId
   */
  @Get(':routeId')
  @HttpCode(HttpStatus.OK)
  async getRouteById(
    @Request() req,
    @Param('routeId') routeId: string,
  ): Promise<{
    message: string;
    route: TravelRouteResponseDto;
  }> {
    const userId = req.user.userId;

    const route = await this.travelRouteService.findByRouteId(routeId);

    if (!route) {
      throw new NotFoundException('Không tìm thấy lộ trình với routeId này.');
    }

    // Kiểm tra quyền truy cập
    if (route.user_id.toString() !== userId) {
      throw new NotFoundException('Bạn không có quyền truy cập lộ trình này.');
    }

    const routeObject = route.toObject ? route.toObject() : { ...route };

    return {
      message: 'Đã tìm thấy lộ trình.',
      route: {
        route_id: routeObject.route_id,
        user_id: routeObject.user_id.toString(),
        created_at: routeObject.created_at,
        status: routeObject.status,
        route_data_json: routeObject.route_data_json,
        id: routeObject._id.toString(),
      },
    };
  }

  /**
   * DELETE /routes/:routeId
   * Xóa lộ trình DRAFT (khi user từ chối)
   */
  @Delete(':routeId')
  @HttpCode(HttpStatus.OK)
  async deleteDraftRoute(
    @Request() req,
    @Param('routeId') routeId: string,
  ): Promise<{
    message: string;
  }> {
    const userId = req.user.userId;

    const deleted = await this.travelRouteService.deleteDraftRoute(
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
}
