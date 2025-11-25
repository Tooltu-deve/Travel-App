import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Query,
    Patch,
    Delete,
    HttpException,
    HttpStatus,
    UseGuards,
    Req,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
    ChatRequestDto,
    AuthenticatedChatRequestDto,
    ChatResponseDto,
    ResetConversationDto
} from './dto/ai-chat.dto';
import {
    CreateAiItineraryDto,
    UpdateAiItineraryDto,
    AiItineraryQueryDto
} from '../itinerary/dto/ai-itinerary.dto';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: AiService) { }

    /**
     * Chat với Travel AI Agent
     */
    @Post('chat')
    @UseGuards(JwtAuthGuard)
    async chat(@Body() chatRequest: AuthenticatedChatRequestDto, @Req() req: any): Promise<ChatResponseDto> {
        try {
            // Debug JWT payload
            console.log('JWT User payload:', req.user);

            // Lấy userId từ JWT token (đã được map bởi JWT Strategy)
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                console.error('No userId found in JWT payload:', req.user);
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            console.log('Authenticated user ID:', userId);

            // Set userId từ token (security)
            chatRequest.userId = userId;

            // Convert to ChatRequestDto for service
            const serviceRequest: ChatRequestDto = {
                message: chatRequest.message,
                userId: userId, // userId is guaranteed to exist due to check above
                sessionId: chatRequest.sessionId,
                context: chatRequest.context,
            };

            return await this.aiService.chatWithAgent(serviceRequest);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to process chat request',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Reset cuộc trò chuyện
     */
    @Post('reset')
    @UseGuards(JwtAuthGuard)
    async resetConversation(@Body() resetRequest: ResetConversationDto, @Req() req: any) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.resetConversation(userId, resetRequest.sessionId);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to reset conversation',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Lấy tất cả conversations của user hiện tại
     */
    @Get('conversations')
    @UseGuards(JwtAuthGuard)
    async getUserConversations(@Req() req: any) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.getUserConversations(userId);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to get conversations',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Health check AI Agent
     */
    @Get('health')
    async healthCheck() {
        return await this.aiService.healthCheck();
    }

    /**
     * Debug AI Agent database (chỉ cho development)
     */
    @Get('debug/database')
    async debugDatabase() {
        // Chỉ cho phép trong development mode
        if (process.env.NODE_ENV === 'production') {
            throw new HttpException('Not available in production', HttpStatus.FORBIDDEN);
        }

        return await this.aiService.debugDatabase();
    }

    /**
     * Quick chat endpoint (không cần authentication - cho testing)
     */
    @Post('chat/quick')
    async quickChat(@Body() body: { message: string; userId?: string; sessionId?: string }) {
        try {
            const chatRequest: ChatRequestDto = {
                message: body.message,
                userId: body.userId || 'anonymous_user',
                sessionId: body.sessionId,
            };

            return await this.aiService.chatWithAgent(chatRequest);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to process quick chat',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // =====================================
    // ITINERARY MANAGEMENT ENDPOINTS
    // =====================================

    /**
     * Lấy danh sách lộ trình đã lưu của user
     */
    @Get('itineraries')
    @UseGuards(JwtAuthGuard)
    async getUserItineraries(@Req() req: any, @Query() query: AiItineraryQueryDto) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.getUserItineraries(userId, query);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to get itineraries',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Lấy chi tiết một lộ trình
     */
    @Get('itineraries/:id')
    @UseGuards(JwtAuthGuard)
    async getItineraryById(@Req() req: any, @Param('id') itineraryId: string) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.getItineraryById(userId, itineraryId);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to get itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Cập nhật lộ trình (đánh dấu yêu thích, đánh giá, ghi chú...)
     */
    @Patch('itineraries/:id')
    @UseGuards(JwtAuthGuard)
    async updateItinerary(
        @Req() req: any,
        @Param('id') itineraryId: string,
        @Body() updateData: UpdateAiItineraryDto
    ) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.updateItinerary(userId, itineraryId, updateData);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to update itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Xóa lộ trình
     */
    @Delete('itineraries/:id')
    @UseGuards(JwtAuthGuard)
    async deleteItinerary(@Req() req: any, @Param('id') itineraryId: string) {
        try {
            const userId = req.user?.userId || req.user?.sub || req.user?.id;

            if (!userId) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            return await this.aiService.deleteItinerary(userId, itineraryId);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                'Failed to delete itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}