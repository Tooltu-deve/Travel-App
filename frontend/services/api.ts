/**
 * API Service Layer
 * Tất cả các API calls đến backend sẽ được quản lý tại đây
 */

// ============================================
// API CONFIGURATION
// ============================================
/**
 * Base URL của backend API
 * 
 * 🔧 THAY ĐỔI URL TẠI ĐÂY:
 * 
 * Nếu cùng mạng WiFi:
 *   const API_BASE_URL = 'http://192.168.1.255:3000';
 * 
 * Nếu dùng Ngrok (không cùng mạng):
 *   const API_BASE_URL = 'https://a1b2c3d4.ngrok.io';
 *   (Lấy URL từ đồng nghiệp MacOS)
 * 
 * Production:
 *   const API_BASE_URL = 'https://api.yourapp.com';
 */
// const API_BASE_URL = 'https://travel-app-r9qu.onrender.com'; // ⬅️ Render Cloud URL
const API_BASE_URL = 'http://localhost:3000'; // ⬅️ Local URL (Android emulator: 10.0.2.2:3000)
// ============================================
// TYPES
// ============================================

// Export API_BASE_URL để các component khác có thể dùng
export { API_BASE_URL };
interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
}

interface LoginResponse {
  success?: boolean;
  message?: string;
  access_token?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface RegisterResponse {
  success?: boolean;
  message?: string;
  access_token?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface ValidateTokenResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface GoogleLoginRequest {
  idToken: string;
}

interface GoogleLoginResponse {
  success?: boolean;
  message?: string;
  access_token?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface GenerateRouteRequest {
  budget: string;
  destination: string;
  user_mood: string;
  duration_days: number;
  current_location: {
    lat: number;
    lng: number;
  };
  start_datetime?: string;
  ecs_score_threshold?: number;
}

export interface TravelRoute {
  route_id: string;
  user_id: string;
  created_at: string;
  title?: string;
  destination?: string;
  duration_days?: number;
  start_datetime?: string | null;
  start_location?: {
    lat: number;
    lng: number;
  };
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';
  route_data_json: any;
  id: string;
}

interface GenerateRouteResponse {
  message: string;
  route: TravelRoute;
}

// Notification types
export type NotificationType = 'favorite' | 'itinerary' | 'account' | 'system';
export type EntityType = 'place' | 'itinerary' | 'system' | null;

export interface Notification {
  _id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  entity_type?: EntityType;
  entity_id?: string | null;
  route_id?: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

interface GetNotificationsParams {
  isRead?: boolean;
  type?: NotificationType;
}

// ============================================
// HELPER FUNCTION
// ============================================
/**
 * makeRequest: Helper function để gọi API
 * Xử lý các lỗi chung như network error, timeout, etc.
 */
const makeRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    console.log('🌐 API Request:', url, options);
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'ReactNative',
        ...options.headers,
      },
    });

    // Get response text first to debug
    const text = await response.text();
    console.log('📄 Response Text:', text.substring(0, 200));

    // Handle 204 No Content - no response body to parse
    if (response.status === 204) {
      console.log('✅ API Response: 204 No Content');
      return undefined as T;
    }

    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(text);
      console.log('✅ API Response:', data);
    } catch (e) {
      console.error('❌ JSON Parse Error. Response was:', text);
      throw new Error('Server returned non-JSON response. Backend might not be running or endpoint is wrong.');
    }

    // Check if response is not ok - throw error with message from server
    if (!response.ok) {
      console.error('❌ HTTP Error:', response.status, response.statusText);
      const errorMessage = data?.message || data?.error?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error) {
    console.error('❌ API Error:', error);
    throw error;
  }
};

// ============================================
// API FUNCTIONS
// ============================================

/**
 * loginAPI: Đăng nhập user
 * 
 * @param email - Email của user
 * @param password - Password của user
 * @returns LoginResponse với token và thông tin user
 * 
 * Endpoint: POST /api/auth/login
 * Request: { email, password }
 * Response: { success, message, token?, user? }
 */
export const loginAPI = async (
  email: string,
  password: string
): Promise<LoginResponse> => {
  return makeRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

/**
 * registerAPI: Đăng ký user mới
 * 
 * @param fullName - Tên đầy đủ
 * @param email - Email
 * @param password - Password
 * @returns RegisterResponse với thông tin user
 * 
 * Endpoint: POST /api/auth/register
 * Request: { fullName, email, password }
 * Response: { success, message, user? }
 */
export const registerAPI = async (
  fullName: string,
  email: string,
  password: string
): Promise<RegisterResponse> => {
  return makeRequest<RegisterResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, password }),
  });
};

/**
 * resendVerificationAPI: Gửi lại email xác thực
 * 
 * @param email - Email cần gửi lại verification
 * @returns Success message
 */
export const resendVerificationAPI = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  return makeRequest<{ success: boolean; message: string }>('/api/v1/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * validateTokenAPI: Validate token với backend
 * Dùng để check xem token còn hợp lệ không khi app khởi động
 * 
 * @param token - JWT token
 * @returns ValidateTokenResponse
 * 
 * Endpoint: GET /api/auth/validate
 * Headers: Authorization: Bearer <token>
 * Response: { success, message, user? }
 */
export const validateTokenAPI = async (
  token: string
): Promise<ValidateTokenResponse> => {
  return makeRequest<ValidateTokenResponse>('/api/v1/auth/validate', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * logoutAPI: Đăng xuất user (optional)
 * Một số backend yêu cầu gọi API logout để invalidate token
 * 
 * @param token - JWT token
 * 
 * Endpoint: POST /api/auth/logout
 * Headers: Authorization: Bearer <token>
 */
export const logoutAPI = async (token: string): Promise<void> => {
  return makeRequest<void>('/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * googleLoginAPI: Đăng nhập/Đăng ký qua Google
 * 
 * @param idToken - ID Token từ Google
 * @returns GoogleLoginResponse với token và thông tin user
 * 
 * Endpoint: POST /api/v1/auth/google-login
 * Request: { idToken }
 * Response: { success, message, token?, user? }
 */
export const googleLoginAPI = async (
  idToken: string
): Promise<GoogleLoginResponse> => {
  return makeRequest<GoogleLoginResponse>('/api/v1/auth/google-login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
};

/**
 * generateRouteAPI: Tạo lộ trình với SmartAgent
 * 
 * @param token - JWT token
 * @param requestBody - Thông tin để tạo lộ trình
 * @returns GenerateRouteResponse với thông tin lộ trình đã tạo
 * 
 * Endpoint: POST /api/v1/routes/generate
 * Headers: Authorization: Bearer <token>
 * Request: { budget, destination, user_mood, duration_days, current_location, start_datetime?, ecs_score_threshold? }
 * Response: { message, route }
 */
export const generateRouteAPI = async (
  token: string,
  requestBody: GenerateRouteRequest
): Promise<GenerateRouteResponse> => {
  return makeRequest<GenerateRouteResponse>('/api/v1/itineraries/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });
};

/**
 * updateRouteStatusAPI: Cập nhật trạng thái lộ trình
 * 
 * @param token - JWT token
 * @param routeId - ID của lộ trình
 * @param status - Trạng thái mới: 'DRAFT' | 'CONFIRMED' | 'MAIN'
 * @returns Response với thông tin lộ trình đã cập nhật
 * 
 * Endpoint: PATCH /api/v1/routes/:routeId/status
 * Headers: Authorization: Bearer <token>
 * Request: { status }
 * Response: { message, route }
 */
interface UpdateRouteStatusPayload {
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';
  title?: string;
}

export const updateRouteStatusAPI = async (
  token: string,
  routeId: string,
  payload: UpdateRouteStatusPayload,
): Promise<{ message: string; route: TravelRoute }> => {
  return makeRequest<{ message: string; route: TravelRoute }>(`/api/v1/itineraries/${routeId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
};

/**
 * deleteRouteAPI: Xóa lộ trình (chỉ DRAFT)
 *
 * @param token - JWT token
 * @param routeId - ID của lộ trình
 * @returns Message từ backend
 *
 * Endpoint: DELETE /api/v1/routes/:routeId
 */
export const deleteRouteAPI = async (
  token: string,
  routeId: string,
): Promise<{ message: string }> => {
  return makeRequest<{ message: string }>(`/api/v1/itineraries/${routeId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * getRoutesAPI: Lấy danh sách lộ trình của user
 *
 * @param token JWT token
 * @param status Optional status filter
 */
export const getRoutesAPI = async (
  token: string,
  status?: 'DRAFT' | 'CONFIRMED' | 'MAIN',
): Promise<{ message: string; routes: TravelRoute[]; total: number }> => {
  const query = status ? `?status=${status}` : '';
  return makeRequest<{ message: string; routes: TravelRoute[]; total: number }>(
    `/api/v1/itineraries${query}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * getRouteByIdAPI: Lấy chi tiết đầy đủ một lộ trình
 *
 * @param token JWT token
 * @param routeId ID của lộ trình
 * @returns Chi tiết đầy đủ lộ trình
 */
export const getRouteByIdAPI = async (
  token: string,
  routeId: string,
): Promise<{ route: TravelRoute }> => {
  return makeRequest<{ route: TravelRoute }>(
    `/api/v1/itineraries/${routeId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * getItineraryAPI: Lấy chi tiết một itinerary cụ thể
 *
 * @param token JWT token
 * @param itineraryId ID của itinerary
 * @returns Chi tiết itinerary bao gồm status
 *
 * Endpoint: GET /api/v1/itineraries/:id
 * Headers: Authorization: Bearer <token>
 * Response: { message, status, ... }
 */
export const getItineraryAPI = async (
  token: string,
  itineraryId: string,
): Promise<{ message?: string; status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';[key: string]: any }> => {
  return makeRequest<{ message?: string; status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';[key: string]: any }>(
    `/api/v1/itineraries/${itineraryId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * getMoodsAPI: Lấy danh sách tất cả moods từ places
 *
 * @param token JWT token
 * @returns Danh sách moods
 *
 * Endpoint: GET /api/v1/favorites/moods
 * Headers: Authorization: Bearer <token>
 * Response: { moods: string[] }
 */
export const getMoodsAPI = async (
  token: string,
): Promise<{ moods: string[] }> => {
  return makeRequest<{ moods: string[] }>(
    '/api/v1/favorites/moods',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * getFavoritesByMoodAPI: Lấy danh sách places đã like theo mood
 *
 * @param token JWT token
 * @param mood Mood để filter
 * @returns Danh sách places
 *
 * Endpoint: GET /api/v1/favorites?mood=<mood>
 * Headers: Authorization: Bearer <token>
 * Response: Array of { id, name, address, mood, rating }
 */
export const getFavoritesByMoodAPI = async (
  token: string,
  mood: string,
): Promise<Array<{
  id: string;
  name: string;
  address: string;
  mood: string;
  rating: number | null;
}>> => {
  return makeRequest<Array<{
    id: string;
    name: string;
    address: string;
    mood: string;
    rating: number | null;
  }>>(
    `/api/v1/favorites?mood=${encodeURIComponent(mood)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * likePlaceAPI: Like hoặc Unlike một place
 *
 * @param token JWT token
 * @param googlePlaceId Google Place ID của place
 * @returns Response từ backend
 *
 * Endpoint: POST /api/v1/favorites/like-place
 * Headers: Authorization: Bearer <token>
 * Request: { google_place_id: <googlePlaceId> }
 * Response: { message, ... }
 */
export const likePlaceAPI = async (
  token: string,
  googlePlaceId: string,
): Promise<{ message: string }> => {
  return makeRequest<{ message: string }>(
    '/api/v1/favorites/like-place',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ google_place_id: googlePlaceId }),
    },
  );
};

/**
 * getLikedPlacesAPI: Lấy tất cả places đã like
 *
 * @param token JWT token
 * @returns Danh sách places đã like
 *
 * Endpoint: GET /api/v1/favorites/liked-places
 * Headers: Authorization: Bearer <token>
 * Response: Array of places
 */
export const getLikedPlacesAPI = async (
  token: string,
): Promise<Array<{
  place_id: string;
  type: string;
  opening_hours: any;
  is_stub: boolean;
}>> => {
  return makeRequest<Array<{
    id: string;
    name: string;
    address: string;
    mood: string;
    rating: number | null;
  }>>(
    '/api/v1/favorites/liked-places',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
};

/**
 * getProfileAPI: Lấy thông tin profile của user hiện tại
 * 
 * @param token - JWT token
 * @returns Profile với email, full_name, preferenced_tags
 * 
 * Endpoint: GET /users/profile
 * Headers: Authorization: Bearer <token>
 * Response: { email, full_name, preferenced_tags }
 */
export const getProfileAPI = async (
  token: string,
): Promise<{
  email: string;
  full_name: string;
  preferenced_tags: string[];
}> => {
  return makeRequest<{
    email: string;
    full_name: string;
    preferenced_tags: string[];
  }>('/api/v1/users/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * updateProfileAPI: Cập nhật emotional tags của user
 * 
 * @param token - JWT token
 * @param preferencedTags - Array các emotional tags
 * @returns Profile đã cập nhật
 * 
 * Endpoint: PATCH /users/profile
 * Headers: Authorization: Bearer <token>
 * Request: { preferencedTags: string[] }
 * Response: { email, full_name, preferenced_tags }
 */
export const updateProfileAPI = async (
  token: string,
  preferencedTags: string[],
): Promise<{
  email: string;
  full_name: string;
  preferenced_tags: string[];
}> => {
  return makeRequest<{
    email: string;
    full_name: string;
    preferenced_tags: string[];
  }>('/api/v1/users/profile', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferencedTags }),
  });
};

/**
 * changePasswordAPI: Đổi mật khẩu cho user đang đăng nhập
 * 
 * @param token - JWT token
 * @param data - Object chứa currentPassword và newPassword
 * @returns Message từ backend
 * 
 * Endpoint: POST /api/v1/auth/change-password
 * Headers: Authorization: Bearer <token>
 * Request: { currentPassword, newPassword }
 * Response: { message }
 */
export const changePasswordAPI = async (
  token: string,
  data: { currentPassword: string; newPassword: string },
): Promise<{ message: string }> => {
  const url = `${API_BASE_URL}/api/v1/auth/change-password`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    // Throw error với message từ backend
    throw new Error(result.message || 'Lỗi đổi mật khẩu');
  }

  return result;
};

/**
 * getPlaceByIdAPI: Lấy chi tiết place theo internal DB id (`placeId` / `_id`)
 * Public endpoint: GET /api/v1/places/:id
 */
export const getPlaceByIdAPI = async (
  id: string,
): Promise<any> => {
  return makeRequest<any>(`/api/v1/places/${id}`, {
    method: 'GET',
  });
};

/**
 * enrichPlaceAPI: Enrich POI với thông tin chi tiết từ Google Places API
 * Protected endpoint: POST /api/v1/places/enrich
 * Requires: Bearer token
 * 
 * @param token - JWT token
 * @param googlePlaceId - Google Place ID của địa điểm
 * @param forceRefresh - Force refresh dữ liệu (optional, default: false)
 * @returns Enriched POI data
 */
export const enrichPlaceAPI = async (
  token: string,
  googlePlaceId: string,
  forceRefresh: boolean = false
): Promise<any> => {
  return makeRequest<any>('/api/v1/places/enrich', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      googlePlaceId,
      forceRefresh,
    }),
  });
};

/**
 * getPlacesAPI: Lấy danh sách địa điểm từ server
 * Public endpoint: GET /api/v1/places
 */
export const getPlacesAPI = async (): Promise<any[]> => {
  return makeRequest<any[]>('/api/v1/places', {
    method: 'GET',
  });
};

/**
 * getNotificationsAPI: Lấy danh sách thông báo của user
 * 
 * @param token JWT token
 * @param params Filter parameters (isRead, type)
 * @returns Array of notifications
 * 
 * Endpoint: GET /api/v1/notifications
 * Headers: Authorization: Bearer <token>
 * Query: ?isRead=true&type=favorite
 * Response: Notification[]
 */
export const getNotificationsAPI = async (
  token: string,
  params?: GetNotificationsParams,
): Promise<Notification[]> => {
  const queryParams = new URLSearchParams();
  if (params?.isRead !== undefined) {
    queryParams.append('isRead', params.isRead.toString());
  }
  if (params?.type) {
    queryParams.append('type', params.type);
  }
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

  return makeRequest<Notification[]>(`/api/v1/notifications${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * getUnreadCountAPI: Lấy số lượng thông báo chưa đọc
 * 
 * @param token JWT token
 * @returns Count of unread notifications
 * 
 * Endpoint: GET /api/v1/notifications/unread-count
 * Headers: Authorization: Bearer <token>
 * Response: { count: number }
 */
export const getUnreadCountAPI = async (
  token: string,
): Promise<{ count: number }> => {
  return makeRequest<{ count: number }>('/api/v1/notifications/unread-count', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * markNotificationAsReadAPI: Đánh dấu một thông báo là đã đọc
 * 
 * @param token JWT token
 * @param notificationId ID của thông báo
 * 
 * Endpoint: PATCH /api/v1/notifications/:id/read
 * Headers: Authorization: Bearer <token>
 * Response: 204 No Content
 */
export const markNotificationAsReadAPI = async (
  token: string,
  notificationId: string,
): Promise<void> => {
  return makeRequest<void>(`/api/v1/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * markAllNotificationsAsReadAPI: Đánh dấu tất cả thông báo là đã đọc
 * 
 * @param token JWT token
 * 
 * Endpoint: PATCH /api/v1/notifications/read-all
 * Headers: Authorization: Bearer <token>
 * Response: 204 No Content
 */
export const markAllNotificationsAsReadAPI = async (
  token: string,
): Promise<void> => {
  return makeRequest<void>('/api/v1/notifications/read-all', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * deleteNotificationAPI: Xóa một thông báo
 * 
 * @param token JWT token
 * @param notificationId ID của thông báo
 * 
 * Endpoint: DELETE /api/v1/notifications/:id
 * Headers: Authorization: Bearer <token>
 * Response: 204 No Content
 */
export const deleteNotificationAPI = async (
  token: string,
  notificationId: string,
): Promise<void> => {
  return makeRequest<void>(`/api/v1/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * deleteAllNotificationsAPI: Xóa tất cả thông báo
 * 
 * @param token JWT token
 * 
 * Endpoint: DELETE /api/v1/notifications
 * Headers: Authorization: Bearer <token>
 * Response: 204 No Content
 */
export const deleteAllNotificationsAPI = async (
  token: string,
): Promise<void> => {
  return makeRequest<void>('/api/v1/notifications', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * chatWithAIAPI: Gửi tin nhắn tới AI Travel Agent
 * 
 * @param token JWT token
 * @param message Tin nhắn gửi tới AI
 * @param sessionId Session ID (nếu có)
 * @param context Ngữ cảnh bổ sung (vị trí hiện tại, v.v.)
 * 
 * Endpoint: POST /api/v1/ai/chat
 * Headers: Authorization: Bearer <token>
 * Response: { response, sessionId, itineraryId, metadata, ... }
 */
export const chatWithAIAPI = async (
  token: string,
  message: string,
  sessionId?: string | null,
  context?: any,
): Promise<any> => {
  const requestBody: any = { message };
  if (sessionId) {
    requestBody.sessionId = sessionId;
  }
  if (context) {
    requestBody.context = context;
  }

  return makeRequest<any>('/api/v1/ai/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
};

/**
 * resetConversationAPI: Reset cuộc trò chuyện với AI
 * 
 * @param token JWT token
 * @param userId User ID
 * @param sessionId Session ID (nếu có)
 * 
 * Endpoint: POST /api/v1/ai/reset
 * Headers: Authorization: Bearer <token>
 * Response: { message, ... }
 */
export const resetConversationAPI = async (
  token: string,
  userId: string,
  sessionId?: string | null,
): Promise<any> => {
  const requestBody: any = { userId };
  if (sessionId) {
    requestBody.sessionId = sessionId;
  }

  return makeRequest<any>('/api/v1/ai/reset', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
};

/**
 * getPlacePhotoAPI: Lấy ảnh của địa điểm từ Google Places API
 * 
 * @param photoName Photo name từ Google Places API (format: places/{place_id}/photos/{photo_reference})
 * @param maxWidthPx Chiều rộng tối đa của ảnh (mặc định 1600)
 * 
 * Endpoint: GET /api/v1/places/photo?name=...&maxWidthPx=...
 * Response: Image data
 */
export const getPlacePhotoAPI = (
  photoName: string,
  maxWidthPx: number = 1600,
): string => {
  const encodedPhotoName = encodeURIComponent(photoName);
  return `${API_BASE_URL}/api/v1/places/photo?name=${encodedPhotoName}&maxWidthPx=${maxWidthPx}`;
};

// ============================================
// CUSTOM ITINERARY API
// ============================================

/**
 * Kiểm tra thời tiết cho chuyến đi
 */
export const checkWeatherAPI = async (
  departureDate: string,
  returnDate: string,
  destination: string,
  token: string
): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/custom-itinerary/weather-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        departureDate,
        returnDate,
        destination,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to check weather');
    }

    return data;
  } catch (error: any) {
    console.error('Check weather error:', error);
    throw error;
  }
};

/**
 * Tính toán routes và lưu custom itinerary
 */
export const calculateRoutesAPI = async (
  payload: {
    destination: string;
    days: Array<{
      dayNumber: number;
      travelMode: string;
      startLocation: string;
      places: Array<{
        placeId: string;
        name: string;
        address: string;
      }>;
    }>;
    optimize?: boolean;
    start_date?: string;
    end_date?: string;
  },
  token: string
): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/custom-itinerary/calculate-routes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to calculate routes');
    }

    return data;
  } catch (error: any) {
    console.error('Calculate routes error:', error);
    throw error;
  }
};

/**
 * Autocomplete địa điểm (Google Places)
 */
export const autocompletePlacesAPI = async (
  input: string,
  sessionToken?: string,
  destination?: string,
  token?: string
): Promise<any> => {
  try {
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/custom-itinerary/autocomplete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input,
        sessionToken,
        destination,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to autocomplete places');
    }

    return data;
  } catch (error: any) {
    console.error('Autocomplete places error:', error);
    throw error;
  }
};

/**
 * Cập nhật status của custom itinerary
 */
export const updateCustomItineraryStatusAPI = async (
  routeId: string,
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN',
  title?: string,
  token?: string
): Promise<any> => {
  try {
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/custom-itinerary/status/${routeId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status,
        title,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update status');
    }

    return data;
  } catch (error: any) {
    console.error('Update custom itinerary status error:', error);
    throw error;
  }
};

/**
 * Lấy danh sách custom itineraries
 */
export const getCustomItinerariesAPI = async (
  token: string,
  status?: 'DRAFT' | 'CONFIRMED' | 'MAIN'
): Promise<any> => {
  try {
    const queryParams = status ? `?status=${status}` : '';
    
    const response = await fetch(`${API_BASE_URL}/api/v1/custom-itinerary/routes${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to get custom itineraries');
    }

    return data;
  } catch (error: any) {
    console.error('Get custom itineraries error:', error);
    throw error;
  }
};

// ============================================
// EXPORT
// ============================================
export default {
  loginAPI,
  registerAPI,
  validateTokenAPI,
  logoutAPI,
  googleLoginAPI,
  generateRouteAPI,
  updateRouteStatusAPI,
  deleteRouteAPI,
  getRoutesAPI,
  getMoodsAPI,
  getFavoritesByMoodAPI,
  likePlaceAPI,
  getLikedPlacesAPI,
  getNotificationsAPI,
  getUnreadCountAPI,
  markNotificationAsReadAPI,
  markAllNotificationsAsReadAPI,
  deleteNotificationAPI,
  deleteAllNotificationsAPI,
  getProfileAPI,
  updateProfileAPI,
  changePasswordAPI,
  getPlaceByIdAPI,
  enrichPlaceAPI,
  getPlacesAPI,
  chatWithAIAPI,
  resetConversationAPI,
  checkWeatherAPI,
  calculateRoutesAPI,
  autocompletePlacesAPI,
  updateCustomItineraryStatusAPI,
  getCustomItinerariesAPI,
};
