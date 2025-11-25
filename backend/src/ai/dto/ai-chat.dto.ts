import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatRequestDto {
    @ApiProperty({
        description: 'Tin nhắn của user',
        example: 'Tôi muốn đi du lịch Hà Nội 2 ngày',
    })
    @IsString()
    @IsNotEmpty()
    message: string;

    @ApiProperty({
        description: 'ID của user',
        example: 'user_123',
    })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiPropertyOptional({
        description: 'Session ID của cuộc trò chuyện (optional)',
        example: 'session_456',
    })
    @IsOptional()
    @IsString()
    sessionId?: string;

    @ApiPropertyOptional({
        description: 'Context bổ sung cho cuộc trò chuyện',
        example: { location: 'Hanoi', previous_preferences: {} },
    })
    @IsOptional()
    @IsObject()
    context?: Record<string, any>;
}

export class AuthenticatedChatRequestDto {
    @ApiProperty({
        description: 'Tin nhắn của user',
        example: 'Tôi muốn đi du lịch Hà Nội 2 ngày',
    })
    @IsString()
    @IsNotEmpty()
    message: string;

    @ApiPropertyOptional({
        description: 'Session ID của cuộc trò chuyện (optional)',
        example: 'session_456',
    })
    @IsOptional()
    @IsString()
    sessionId?: string;

    @ApiPropertyOptional({
        description: 'Context bổ sung cho cuộc trò chuyện',
        example: { location: 'Hanoi', previous_preferences: {} },
    })
    @IsOptional()
    @IsObject()
    context?: Record<string, any>;

    // userId sẽ được thêm từ JWT token, không cần trong request body
    userId?: string;
}

export class ChatResponseDto {
    @ApiProperty({
        description: 'Response từ AI Agent',
        example: 'Tôi sẽ giúp bạn tạo lộ trình du lịch Hà Nội 2 ngày...',
    })
    response: string;

    @ApiProperty({
        description: 'Session ID của cuộc trò chuyện',
        example: 'user_123_20251124_140530',
    })
    sessionId: string;

    @ApiProperty({
        description: 'Giai đoạn hiện tại của conversation',
        example: 'profiling',
        enum: ['profiling', 'planning', 'optimizing', 'finalizing', 'complete'],
    })
    stage: string;

    @ApiProperty({
        description: 'Preferences đã thu thập được',
        example: {
            travel_style: 'cultural',
            group_type: 'couple',
            budget_range: 'mid-range',
            duration: '2_days',
        },
    })
    preferences: Record<string, any>;

    @ApiProperty({
        description: 'Lộ trình du lịch (nếu có)',
        example: [
            {
                time: '09:00',
                activity: 'Tham quan',
                place: { name: 'Hoàn Kiếm Lake', address: 'Hoàn Kiếm, Hà Nội' },
            },
        ],
    })
    itinerary: any[];

    @ApiProperty({
        description: 'Gợi ý cho câu hỏi tiếp theo',
        example: [
            'Bạn thích du lịch kiểu gì? (chill, phiêu lưu, văn hóa)',
            'Bạn đi một mình hay cùng ai?',
        ],
    })
    suggestions: string[];

    @ApiProperty({
        description: 'Metadata bổ sung',
        example: {
            timestamp: '2025-11-24T14:05:30Z',
            optimization_applied: true,
            weather_checked: false,
        },
    })
    metadata: Record<string, any>;
}

export class ResetConversationDto {
    @ApiProperty({
        description: 'ID của user',
        example: 'user_123',
    })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiPropertyOptional({
        description: 'Session ID cụ thể cần reset (optional)',
        example: 'session_456',
    })
    @IsOptional()
    @IsString()
    sessionId?: string;
}