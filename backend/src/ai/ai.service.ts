import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { ChatRequestDto, ChatResponseDto } from './dto/ai-chat.dto';
import { AiItinerary, AiItineraryDocument } from '../itinerary/schemas/ai-itinerary.schema';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly AI_AGENT_URL: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectModel(AiItinerary.name) private aiItineraryModel: Model<AiItineraryDocument>,
    ) {
        // AI Agent URL from environment or default
        this.AI_AGENT_URL =
            this.configService.get<string>('AI_AGENT_URL') ||
            'http://localhost:8000';
    }

    /**
     * Chat với Travel AI Agent
     */
    async chatWithAgent(chatRequest: ChatRequestDto): Promise<ChatResponseDto> {
        try {
            this.logger.log(`Sending request to AI Agent: ${chatRequest.message.substring(0, 50)}...`);

            const response = await firstValueFrom(
                this.httpService.post(`${this.AI_AGENT_URL}/chat`, {
                    message: chatRequest.message,
                    user_id: chatRequest.userId,
                    session_id: chatRequest.sessionId,
                    context: chatRequest.context,
                }, {
                    timeout: 30000, // 30 second timeout
                })
            );

            this.logger.log(`AI Agent response received for user ${chatRequest.userId}`);

            const responseData: ChatResponseDto = {
                response: response.data.response,
                sessionId: response.data.session_id,
                stage: response.data.stage,
                preferences: response.data.preferences,
                itinerary: response.data.itinerary,
                suggestions: response.data.suggestions || [],
                metadata: response.data.metadata || {},
            };

            // Auto-save completed itinerary to database
            if (response.data.stage === 'complete' && response.data.itinerary?.length > 0) {
                try {
                    await this.saveItineraryToDatabase(chatRequest.userId, responseData);
                    this.logger.log(`Auto-saved itinerary for user ${chatRequest.userId}`);
                } catch (saveError) {
                    this.logger.error(`Failed to auto-save itinerary: ${saveError.message}`);
                    // Don't throw error, just log it - user still gets the response
                }
            }

            return responseData;

        } catch (error) {
            this.logger.error(`AI Agent request failed: ${error.message}`, error.stack);

            // Check if it's a connection error
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                throw new HttpException(
                    'Travel AI Agent service is not available. Please try again later.',
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }

            // Check if it's a timeout
            if (error.code === 'ECONNABORTED') {
                throw new HttpException(
                    'AI Agent request timed out. Please try with a shorter message.',
                    HttpStatus.REQUEST_TIMEOUT,
                );
            }

            // Other errors
            throw new HttpException(
                'Failed to get response from AI Agent',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Reset conversation với AI Agent
     */
    async resetConversation(userId: string, sessionId?: string): Promise<{ message: string }> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(`${this.AI_AGENT_URL}/reset`, {
                    user_id: userId,
                    session_id: sessionId,
                })
            );

            return response.data;

        } catch (error) {
            this.logger.error(`Failed to reset conversation: ${error.message}`);
            throw new HttpException(
                'Failed to reset conversation',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Lấy conversations của user
     */
    async getUserConversations(userId: string): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.AI_AGENT_URL}/conversations/${userId}`)
            );

            return response.data;

        } catch (error) {
            this.logger.error(`Failed to get user conversations: ${error.message}`);
            throw new HttpException(
                'Failed to get conversations',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Health check AI Agent
     */
    async healthCheck(): Promise<{ status: string; aiAgentStatus: string }> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.AI_AGENT_URL}/health`, {
                    timeout: 5000,
                })
            );

            return {
                status: 'healthy',
                aiAgentStatus: response.data.status || 'unknown',
            };

        } catch (error) {
            this.logger.warn(`AI Agent health check failed: ${error.message}`);

            return {
                status: 'healthy', // Backend still works
                aiAgentStatus: 'unavailable',
            };
        }
    }

    /**
     * Debug database connection của AI Agent
     */
    async debugDatabase(): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.AI_AGENT_URL}/debug/database`)
            );

            return response.data;

        } catch (error) {
            this.logger.error(`Failed to debug AI Agent database: ${error.message}`);
            throw new HttpException(
                'Failed to debug AI Agent database',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Lưu lộ trình vào database khi AI tạo xong
     */
    private async saveItineraryToDatabase(userId: string, aiResponse: ChatResponseDto): Promise<AiItineraryDocument> {
        try {
            // Generate title from preferences
            const { preferences, itinerary } = aiResponse;
            const destination = this.extractDestination(itinerary);
            const duration = preferences.duration?.replace('_', ' ') || '';
            const groupType = preferences.group_type || '';
            const travelStyle = preferences.travel_style || '';

            const title = `${destination} ${duration} - ${groupType} ${travelStyle}`.trim();

            // Generate tags
            const tags = this.generateTags(preferences, itinerary);

            // Calculate travel date (default to next week)
            const travelDate = new Date();
            travelDate.setDate(travelDate.getDate() + 7);

            const itineraryDoc = new this.aiItineraryModel({
                userId: userId,
                sessionId: aiResponse.sessionId,
                title,
                preferences: aiResponse.preferences,
                itinerary: aiResponse.itinerary,
                metadata: aiResponse.metadata,
                status: 'completed',
                tags,
                travel_date: travelDate,
                is_favorite: false,
            });

            const saved = await itineraryDoc.save();
            this.logger.log(`Saved itinerary with ID: ${saved._id}`);
            return saved;

        } catch (error) {
            this.logger.error(`Error saving itinerary to database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract destination from itinerary
     */
    private extractDestination(itinerary: any[]): string {
        if (!itinerary || itinerary.length === 0) return '';

        const firstPlace = itinerary[0]?.place?.address || '';
        // Extract city from address (e.g., "Hà Nội" from "123 Street, Hoàn Kiếm, Hà Nội")
        const parts = firstPlace.split(',');
        return parts[parts.length - 1]?.trim() || 'Unknown';
    }

    /**
     * Generate tags for itinerary
     */
    private generateTags(preferences: any, itinerary: any[]): string[] {
        const tags: string[] = [];

        if (preferences.travel_style) tags.push(preferences.travel_style);
        if (preferences.group_type) tags.push(preferences.group_type);
        if (preferences.budget_range) tags.push(preferences.budget_range);
        if (preferences.duration) tags.push(preferences.duration.replace('_', '-'));

        // Add destination tag
        const destination = this.extractDestination(itinerary).toLowerCase();
        if (destination && destination !== 'unknown') {
            tags.push(destination);
        }

        // Add activity type tags based on places
        const placeTypes = itinerary.map(item => item.place?.type).filter(Boolean);
        const uniqueTypes = [...new Set(placeTypes)];
        tags.push(...uniqueTypes.slice(0, 3)); // Max 3 type tags

        return [...new Set(tags)]; // Remove duplicates
    }

    /**
     * Lấy danh sách lộ trình đã lưu của user
     */
    async getUserItineraries(userId: string, query?: any): Promise<AiItineraryDocument[]> {
        try {
            const filter: any = { userId };

            if (query?.status) filter.status = query.status;
            if (query?.is_favorite === 'true') filter.is_favorite = true;
            if (query?.tags) {
                filter.tags = { $in: query.tags.split(',') };
            }

            const limit = parseInt(query?.limit) || 10;
            const skip = parseInt(query?.skip) || 0;

            const itineraries = await this.aiItineraryModel
                .find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(skip)
                .exec();

            return itineraries;

        } catch (error) {
            this.logger.error(`Failed to get user itineraries: ${error.message}`);
            throw new HttpException(
                'Failed to get itineraries',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Lấy chi tiết một lộ trình
     */
    async getItineraryById(userId: string, itineraryId: string): Promise<AiItineraryDocument> {
        try {
            const itinerary = await this.aiItineraryModel.findOne({
                _id: itineraryId,
                userId,
            }).exec();

            if (!itinerary) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            return itinerary;

        } catch (error) {
            this.logger.error(`Failed to get itinerary: ${error.message}`);
            throw new HttpException(
                'Failed to get itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Cập nhật lộ trình
     */
    async updateItinerary(userId: string, itineraryId: string, updateData: any): Promise<AiItineraryDocument> {
        try {
            const updated = await this.aiItineraryModel.findOneAndUpdate(
                { _id: itineraryId, userId },
                updateData,
                { new: true }
            ).exec();

            if (!updated) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            return updated;

        } catch (error) {
            this.logger.error(`Failed to update itinerary: ${error.message}`);
            throw new HttpException(
                'Failed to update itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Xóa lộ trình
     */
    async deleteItinerary(userId: string, itineraryId: string): Promise<{ message: string }> {
        try {
            const deleted = await this.aiItineraryModel.findOneAndDelete({
                _id: itineraryId,
                userId,
            }).exec();

            if (!deleted) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            return { message: 'Itinerary deleted successfully' };

        } catch (error) {
            this.logger.error(`Failed to delete itinerary: ${error.message}`);
            throw new HttpException(
                'Failed to delete itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}