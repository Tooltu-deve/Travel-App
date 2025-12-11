import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { ChatRequestDto, ChatResponseDto } from './dto/ai-chat.dto';
import { AiItinerary, AiItineraryDocument } from '../itinerary/schemas/ai-itinerary.schema';
import { Itinerary, ItineraryDocument } from '../itinerary/schemas/itinerary.schema';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly AI_AGENT_URL: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectModel(AiItinerary.name) private aiItineraryModel: Model<AiItineraryDocument>,
        @InjectModel(Itinerary.name) private itineraryModel: Model<ItineraryDocument>,
    ) {
        // AI Agent URL from environment or default
        this.AI_AGENT_URL =
            this.configService.get<string>('AI_AGENT_URL') ||
            'http://localhost:8001';  // AI Agent runs on port 8001
    }

    /**
     * Chat với Travel AI Agent
     */
    async chatWithAgent(chatRequest: ChatRequestDto): Promise<ChatResponseDto> {
        try {
            this.logger.log(`Sending request to AI Agent: ${chatRequest.message.substring(0, 50)}...`);

            // Prepare context - include itinerary_id from latest DRAFT itinerary if not provided
            let requestContext = chatRequest.context || {};

            // If context doesn't have itinerary_id, try to get latest itinerary (DRAFT or CONFIRMED)
            if (!requestContext.itinerary_id) {
                try {
                    const latestItinerary = await this.aiItineraryModel
                        .findOne({ userId: chatRequest.userId })
                        .sort({ updatedAt: -1 })
                        .exec();

                    if (latestItinerary) {
                        requestContext.itinerary_id = (latestItinerary._id as any).toString();
                        requestContext.itinerary_status = latestItinerary.status;
                        this.logger.log(`Auto-attached latest itinerary: ${requestContext.itinerary_id} (status: ${latestItinerary.status})`);
                    }
                } catch (err) {
                    this.logger.warn(`Failed to fetch latest itinerary: ${err.message}`);
                }
            } else {
                // Context already has itinerary_id, fetch its status
                try {
                    const existingItinerary = await this.aiItineraryModel.findById(requestContext.itinerary_id).exec();
                    if (existingItinerary) {
                        requestContext.itinerary_status = existingItinerary.status;
                        this.logger.log(`Attached itinerary status: ${existingItinerary.status} for itinerary ${requestContext.itinerary_id}`);
                    }
                } catch (err) {
                    this.logger.warn(`Failed to fetch itinerary status: ${err.message}`);
                }
            } const response = await firstValueFrom(
                this.httpService.post(`${this.AI_AGENT_URL}/chat`, {
                    message: chatRequest.message,
                    user_id: chatRequest.userId,
                    session_id: chatRequest.sessionId,
                    context: requestContext,
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
                start_location: response.data.start_location || response.data.metadata?.start_location, // Include start_location
            };

            // FALLBACK: If itinerary lacks polylines, enrich them
            if (responseData.itinerary && responseData.itinerary.length > 0) {
                const hasPolylines = responseData.itinerary.some((item: any) => item.encoded_polyline);

                if (!hasPolylines) {
                    this.logger.warn('⚠️ Itinerary has no polylines, attempting enrichment...');
                    try {
                        const startLocation = this.extractStartLocation(responseData.itinerary, responseData.preferences);
                        responseData.itinerary = await this.enrichItineraryWithPolylines(responseData.itinerary, startLocation);
                        this.logger.log('✅ Successfully enriched itinerary with polylines');
                    } catch (enrichError) {
                        this.logger.warn(`Could not enrich polylines: ${enrichError.message}`);
                        // Continue without polylines - not critical
                    }
                } else {
                    const itemsWithPolylines = responseData.itinerary.filter((item: any) => item.encoded_polyline).length;
                    this.logger.log(`✓ Itinerary already has polylines (${itemsWithPolylines}/${responseData.itinerary.length} items)`);
                }
            }

            // Auto-save completed itinerary to database
            if (response.data.stage === 'complete' && response.data.itinerary?.length > 0) {
                try {
                    const savedItinerary = await this.saveItineraryToDatabase(chatRequest.userId, responseData);
                    const itineraryId = (savedItinerary._id as any).toString();
                    responseData.itineraryId = itineraryId;
                    this.logger.log(`Auto-saved itinerary ${itineraryId} for user ${chatRequest.userId}`);

                    // Update AI Agent state with itinerary_id and itinerary data
                    try {
                        await this.updateAgentStateWithItineraryId(
                            chatRequest.userId,
                            responseData.sessionId,
                            itineraryId,
                            responseData.itinerary  // Pass itinerary data for modification
                        );
                    } catch (stateError) {
                        this.logger.error(`Failed to update AI Agent state: ${stateError.message}`);
                    }
                } catch (saveError) {
                    this.logger.error(`Failed to auto-save itinerary: ${saveError.message}`);
                    // Don't throw error, just log it - user still gets the response
                }
            }

            // Update database when itinerary is modified
            if (response.data.stage === 'modified' && response.data.itinerary?.length > 0) {
                try {
                    // Get itinerary_id from context or metadata
                    const itineraryId = chatRequest.context?.itinerary_id || responseData.metadata?.itinerary_id;

                    if (itineraryId) {
                        // Check if itinerary status allows modification
                        const existingItinerary = await this.aiItineraryModel.findById(itineraryId).exec();

                        if (!existingItinerary) {
                            this.logger.warn(`Itinerary ${itineraryId} not found`);
                        } else if (existingItinerary.status === 'CONFIRMED') {
                            this.logger.warn(`Cannot modify CONFIRMED itinerary ${itineraryId}`);
                            // Override response to inform user
                            responseData.response = '❌ Không thể chỉnh sửa lộ trình đã xác nhận.\n\nLộ trình này đã được xác nhận và không thể thay đổi. Bạn có thể tạo lộ trình mới hoặc tạo bản sao để chỉnh sửa.';
                            responseData.stage = 'error';
                        } else {
                            // Only update if status is DRAFT or ARCHIVED
                            await this.updateItinerary(chatRequest.userId, itineraryId, {
                                itinerary: responseData.itinerary,
                                preferences: responseData.preferences,
                            });
                            responseData.itineraryId = itineraryId;
                            this.logger.log(`Updated DRAFT itinerary ${itineraryId} after modification`);
                        }
                    } else {
                        this.logger.warn('Modified itinerary but no itinerary_id found');
                    }
                } catch (updateError) {
                    this.logger.error(`Failed to update modified itinerary: ${updateError.message}`);
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
     * Update AI Agent conversation state with itinerary_id and itinerary data
     */
    private async updateAgentStateWithItineraryId(userId: string, sessionId: string, itineraryId: string, itinerary?: any[]): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.post(`${this.AI_AGENT_URL}/update-state`, {
                    user_id: userId,
                    session_id: sessionId,
                    state_updates: {
                        itinerary_id: itineraryId,
                        current_itinerary: itinerary || []  // Save itinerary data for modification
                    }
                }, {
                    timeout: 5000
                })
            );
            this.logger.log(`Updated AI Agent state with itinerary_id: ${itineraryId}`);
        } catch (error) {
            this.logger.error(`Failed to update AI Agent state: ${error.message}`);
            throw error;
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

            // Calculate start_location from preferences.departure_coordinates (user's departure point)
            const startLocation = this.extractStartLocation(itinerary, preferences);

            const itineraryDoc = new this.aiItineraryModel({
                userId: userId,
                sessionId: aiResponse.sessionId,
                title,
                preferences: aiResponse.preferences,
                itinerary: aiResponse.itinerary,
                start_location: startLocation,  // Save departure coordinates
                metadata: aiResponse.metadata,
                status: 'DRAFT',  // Set as DRAFT when AI creates itinerary
                tags,
                travel_date: travelDate,
                is_favorite: false,
            });

            const saved = await itineraryDoc.save();
            this.logger.log(`Saved itinerary with ID: ${saved._id}, start_location: ${JSON.stringify(startLocation)}`);
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
    async getItineraryById(userId: string, itineraryId: string): Promise<any> {
        try {
            const itinerary = await this.aiItineraryModel.findOne({
                _id: itineraryId,
                userId,
            }).exec();

            if (!itinerary) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            // Add computed fields for frontend
            const response = itinerary.toObject ? itinerary.toObject() : itinerary;

            // Add start_location (departure point) calculated from preferences
            const startLocation = this.extractStartLocation(
                itinerary.itinerary || [],
                itinerary.preferences
            );
            if (startLocation) {
                response.start_location = startLocation;
            }

            return response;

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
     * Xác nhận lộ trình (DRAFT → CONFIRMED)
     * Chuyển status từ DRAFT sang CONFIRMED khi user hài lòng
     */
    async confirmItinerary(userId: string, itineraryId: string): Promise<any> {
        try {
            // 1. Lấy itinerary từ ai-itineraries collection
            const aiItinerary = await this.aiItineraryModel.findOne({
                _id: itineraryId,
                userId,
            }).exec();

            if (!aiItinerary) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            if (aiItinerary.status === 'CONFIRMED') {
                throw new HttpException('Itinerary already confirmed', HttpStatus.BAD_REQUEST);
            }

            // 2. Chuyển đổi dữ liệu từ AI format sang Itinerary format
            const userObjectId = Types.ObjectId.isValid(userId)
                ? new Types.ObjectId(userId)
                : userId;

            // Convert itinerary items to route_data_json format
            const routeDataJson = {
                optimized_route: this.groupItineraryByDay(aiItinerary.itinerary),
                metadata: {
                    title: aiItinerary.title,
                    destination: this.extractDestination(aiItinerary.itinerary),
                    duration_days: this.calculateDurationDays(aiItinerary.itinerary),
                    total_places: aiItinerary.itinerary.length,
                    preferences: aiItinerary.preferences,
                },
            };

            // 3. Tạo document mới trong itineraries collection
            const newItinerary = new this.itineraryModel({
                route_id: `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: userObjectId,
                title: aiItinerary.title,
                destination: this.extractDestination(aiItinerary.itinerary),
                duration_days: this.calculateDurationDays(aiItinerary.itinerary),
                start_datetime: aiItinerary.travel_date || new Date(),
                start_location: this.extractStartLocation(aiItinerary.itinerary, aiItinerary.preferences),
                status: 'CONFIRMED',
                route_data_json: routeDataJson,
            });

            const savedItinerary = await newItinerary.save();
            this.logger.log(`Migrated AI itinerary ${itineraryId} to main itineraries collection: ${savedItinerary.route_id}`);

            // 4. Cập nhật status trong ai-itineraries (để đánh dấu đã migrate)
            aiItinerary.status = 'CONFIRMED';
            (aiItinerary.metadata as any).migrated_to_route_id = savedItinerary.route_id;
            (aiItinerary.metadata as any).migrated_at = new Date().toISOString();
            await aiItinerary.save();

            return {
                ...aiItinerary.toObject(),
                route_id: savedItinerary.route_id,
                migrated: true,
            };

        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Failed to confirm itinerary: ${error.message}`);
            throw new HttpException(
                'Failed to confirm itinerary',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Group itinerary items by day
     */
    private groupItineraryByDay(itinerary: any[]): any[] {
        const dayMap = new Map<number, any[]>();

        itinerary.forEach(item => {
            const day = item.day || 1;
            if (!dayMap.has(day)) {
                dayMap.set(day, []);
            }

            // Extract location from place for frontend compatibility
            let location: { lat: number; lng: number } | null = null;
            if (item.place?.location) {
                // Handle GeoJSON format: { type: 'Point', coordinates: [lng, lat] }
                if (item.place.location.coordinates && Array.isArray(item.place.location.coordinates)) {
                    const [lng, lat] = item.place.location.coordinates;
                    location = { lat, lng };
                }
                // Handle direct lat/lng format
                else if (item.place.location.lat && item.place.location.lng) {
                    location = {
                        lat: item.place.location.lat,
                        lng: item.place.location.lng,
                    };
                }
            }

            dayMap.get(day)!.push({
                name: item.place?.name || item.activity,
                activity: item.activity,
                time: item.time,
                location,
                place: item.place,
                duration_minutes: item.duration_minutes,
                ecs_score: item.ecs_score,
                estimated_arrival: item.estimated_arrival,
                estimated_departure: item.estimated_departure,
                google_place_id: item.google_place_id || item.place?.googlePlaceId,
                encoded_polyline: item.encoded_polyline,
                start_location_polyline: item.start_location_polyline,
                travel_duration_minutes: item.travel_duration_minutes,
                travel_duration_from_start: item.travel_duration_from_start,
            });
        });

        const days: any[] = [];
        dayMap.forEach((activities, dayNumber) => {
            days.push({
                day: dayNumber,
                activities,
            });
        });

        return days.sort((a, b) => a.day - b.day);
    }

    /**
     * Calculate duration in days from itinerary
     */
    private calculateDurationDays(itinerary: any[]): number {
        if (!itinerary || itinerary.length === 0) return 1;
        const maxDay = Math.max(...itinerary.map(item => item.day || 1));
        return maxDay;
    }

    /**
     * Extract start location from first itinerary item
     */
    private extractStartLocation(itinerary: any[], preferences?: any): { lat: number; lng: number } | null {
        // Priority 1: Use departure_coordinates from preferences (user's departure point)
        if (preferences?.departure_coordinates?.lat && preferences?.departure_coordinates?.lng) {
            return {
                lat: preferences.departure_coordinates.lat,
                lng: preferences.departure_coordinates.lng,
            };
        }

        // Priority 2: Use first place in itinerary (fallback)
        if (!itinerary || itinerary.length === 0) return null;
        const firstPlace = itinerary[0]?.place;
        if (firstPlace?.location) {
            return {
                lat: firstPlace.location.lat,
                lng: firstPlace.location.lng,
            };
        }
        return null;
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

    /**
     * Enrich itinerary với Google Directions API
     * Thêm encoded_polyline và travel_duration_minutes cho mỗi leg
     */
    async enrichItineraryWithDirections(userId: string, itineraryId: string): Promise<AiItineraryDocument> {
        try {
            const itinerary = await this.aiItineraryModel.findOne({
                _id: itineraryId,
                userId,
            }).exec();

            if (!itinerary) {
                throw new HttpException('Itinerary not found', HttpStatus.NOT_FOUND);
            }

            // Get Google Directions API key
            const googleApiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') ||
                this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY');

            if (!googleApiKey) {
                this.logger.warn('Google API key not found, skipping enrichment');
                return itinerary;
            }

            // Enrich each day's activities with directions
            const enrichedItinerary = [...itinerary.itinerary];
            let previousLocation: { lat: number; lng: number } | null = null;

            for (let i = 0; i < enrichedItinerary.length; i++) {
                const activity = enrichedItinerary[i];
                const place = activity.place;

                if (!place || !place.location || !place.location.coordinates) {
                    continue;
                }

                const [lng, lat] = place.location.coordinates;
                const currentLocation = { lat, lng };

                // Get directions from previous location (if exists)
                if (previousLocation) {
                    try {
                        const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?` +
                            `origin=${previousLocation.lat},${previousLocation.lng}&` +
                            `destination=${currentLocation.lat},${currentLocation.lng}&` +
                            `mode=driving&key=${googleApiKey}`;

                        const response = await firstValueFrom(
                            this.httpService.get(directionsUrl, { timeout: 10000 })
                        );

                        const data = response.data;

                        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
                            const route = data.routes[0];
                            const leg = route.legs[0];
                            const overviewPolyline = route.overview_polyline?.points;
                            const durationSeconds = leg.duration?.value || 0;
                            const travelDurationMinutes = durationSeconds > 0 ? durationSeconds / 60.0 : undefined;

                            // Add directions info to activity
                            enrichedItinerary[i] = {
                                ...activity,
                                encoded_polyline: overviewPolyline,
                                travel_duration_minutes: travelDurationMinutes,
                                distance_meters: leg.distance?.value || undefined,
                                distance_text: leg.distance?.text || undefined,
                            };
                        }
                    } catch (directionsError) {
                        this.logger.warn(`Failed to get directions for activity ${i}: ${directionsError.message}`);
                        // Continue without directions for this leg
                    }
                }

                previousLocation = currentLocation;
            }

            // Update itinerary with enriched data
            itinerary.itinerary = enrichedItinerary;
            itinerary.metadata = {
                ...itinerary.metadata,
                directions_enriched: true,
                enriched_at: new Date().toISOString(),
            };

            await itinerary.save();

            this.logger.log(`Successfully enriched itinerary ${itineraryId} with directions`);
            return itinerary;

        } catch (error) {
            this.logger.error(`Failed to enrich itinerary: ${error.message}`);
            throw new HttpException(
                'Failed to enrich itinerary with directions',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * FALLBACK: Enrich itinerary array with polylines from Google Directions API
     * Used when AI Agent response lacks polylines
     */
    private async enrichItineraryWithPolylines(itinerary: any[], startLocation?: { lat: number; lng: number } | null): Promise<any[]> {
        const googleApiKey = this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') ||
            this.configService.get<string>('GOOGLE_PLACES_API_KEY');

        if (!googleApiKey) {
            this.logger.warn('No Google API key available for enriching polylines');
            return itinerary;
        }

        const enriched = [...itinerary];

        // Group items by day to process routes within each day
        const itemsByDay = new Map<number, any[]>();
        enriched.forEach(item => {
            const day = item.day || 1;
            if (!itemsByDay.has(day)) {
                itemsByDay.set(day, []);
            }
            const dayItems = itemsByDay.get(day);
            if (dayItems) {
                dayItems.push(item);
            }
        });

        // Process each day's route
        for (const [day, dayItems] of itemsByDay.entries()) {
            this.logger.debug(`Processing ${dayItems.length} items for day ${day}`);

            // Sort by time to get correct order
            dayItems.sort((a, b) => {
                const timeA = a.time || '00:00';
                const timeB = b.time || '00:00';
                return timeA.localeCompare(timeB);
            });

            // Add polyline from start_location to first activity (for all days)
            if (dayItems.length > 0 && startLocation) {
                const firstItem = dayItems[0];
                try {
                    // Skip if already has start_location_polyline
                    if (!firstItem.start_location_polyline) {
                        const firstLoc = firstItem.place?.location || firstItem.location;

                        if (firstLoc) {
                            // Handle various location formats
                            const getFirstCoords = () => {
                                if (typeof firstLoc.lat === 'number' && typeof firstLoc.lng === 'number') {
                                    return { lat: firstLoc.lat, lng: firstLoc.lng };
                                }
                                if (Array.isArray(firstLoc) && firstLoc.length >= 2) {
                                    return { lat: firstLoc[1], lng: firstLoc[0] }; // GeoJSON [lng, lat]
                                }
                                if (firstLoc.coordinates && Array.isArray(firstLoc.coordinates)) {
                                    return { lat: firstLoc.coordinates[1], lng: firstLoc.coordinates[0] };
                                }
                                return null;
                            };

                            const toCoords = getFirstCoords();

                            if (toCoords) {
                                // Call Google Directions API
                                const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?` +
                                    `origin=${startLocation.lat},${startLocation.lng}&` +
                                    `destination=${toCoords.lat},${toCoords.lng}&` +
                                    `mode=driving&key=${googleApiKey}`;

                                try {
                                    const response = await firstValueFrom(
                                        this.httpService.get(directionsUrl, { timeout: 5000 })
                                    );

                                    const data = response.data;
                                    if (data.routes && data.routes.length > 0) {
                                        const polyline = data.routes[0].overview_polyline?.points;
                                        const duration = data.routes[0].legs?.[0]?.duration?.value || 0;

                                        if (polyline) {
                                            firstItem.start_location_polyline = polyline;
                                            firstItem.travel_duration_from_start = Math.round(duration / 60);
                                            this.logger.debug(`✓ Added start_location_polyline for day ${day} (${polyline.length} chars)`);
                                        }
                                    } else {
                                        this.logger.debug(`No route found from start_location to first activity`);
                                    }
                                } catch (apiError) {
                                    this.logger.warn(`Failed to fetch directions from start_location: ${apiError.message}`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Error processing start_location_polyline: ${error.message}`);
                }
            }

            // Add polylines between consecutive activities
            for (let i = 0; i < dayItems.length - 1; i++) {
                const currentItem = dayItems[i];
                const nextItem = dayItems[i + 1];

                try {
                    // Skip if polyline already exists
                    if (currentItem.encoded_polyline) {
                        this.logger.debug(`Item ${i} already has polyline`);
                        continue;
                    }

                    // Extract locations
                    const currentLoc = currentItem.place?.location || currentItem.location;
                    const nextLoc = nextItem.place?.location || nextItem.location;

                    if (!currentLoc || !nextLoc) {
                        this.logger.debug(`Skipping item ${i}: missing location`);
                        continue;
                    }

                    // Handle various location formats
                    const getCurrentCoords = () => {
                        if (typeof currentLoc.lat === 'number' && typeof currentLoc.lng === 'number') {
                            return { lat: currentLoc.lat, lng: currentLoc.lng };
                        }
                        if (Array.isArray(currentLoc) && currentLoc.length >= 2) {
                            return { lat: currentLoc[1], lng: currentLoc[0] }; // GeoJSON [lng, lat]
                        }
                        if (currentLoc.coordinates && Array.isArray(currentLoc.coordinates)) {
                            return { lat: currentLoc.coordinates[1], lng: currentLoc.coordinates[0] };
                        }
                        return null;
                    };

                    const getNextCoords = () => {
                        if (typeof nextLoc.lat === 'number' && typeof nextLoc.lng === 'number') {
                            return { lat: nextLoc.lat, lng: nextLoc.lng };
                        }
                        if (Array.isArray(nextLoc) && nextLoc.length >= 2) {
                            return { lat: nextLoc[1], lng: nextLoc[0] }; // GeoJSON [lng, lat]
                        }
                        if (nextLoc.coordinates && Array.isArray(nextLoc.coordinates)) {
                            return { lat: nextLoc.coordinates[1], lng: nextLoc.coordinates[0] };
                        }
                        return null;
                    };

                    const fromCoords = getCurrentCoords();
                    const toCoords = getNextCoords();

                    if (!fromCoords || !toCoords) {
                        this.logger.debug(`Could not parse coordinates for day ${day} item ${i}`);
                        continue;
                    }

                    // Call Google Directions API using HttpService
                    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?` +
                        `origin=${fromCoords.lat},${fromCoords.lng}&` +
                        `destination=${toCoords.lat},${toCoords.lng}&` +
                        `mode=driving&key=${googleApiKey}`;

                    try {
                        const response = await firstValueFrom(
                            this.httpService.get(directionsUrl, { timeout: 5000 })
                        );

                        const data = response.data;
                        if (data.routes && data.routes.length > 0) {
                            const polyline = data.routes[0].overview_polyline?.points;
                            const duration = data.routes[0].legs?.[0]?.duration?.value || 0;

                            if (polyline) {
                                currentItem.encoded_polyline = polyline;
                                currentItem.travel_duration_minutes = Math.round(duration / 60);
                                this.logger.debug(`✓ Added polyline for day ${day} item ${i} (${polyline.length} chars)`);
                            }
                        } else {
                            this.logger.debug(`No route found for day ${day} item ${i}`);
                        }
                    } catch (apiError) {
                        this.logger.warn(`Failed to fetch directions: ${apiError.message}`);
                    }

                } catch (error) {
                    this.logger.warn(`Error processing polyline for day ${day} item ${i}: ${error.message}`);
                    // Continue with next item
                }
            }
        }

        return enriched;
    }
}