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
const API_BASE_URL = 'https://travel-app-r9qu.onrender.com'; // ⬅️ Render Cloud URL

// ============================================
// TYPES
// ============================================
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
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  route_data_json: any;
  id: string;
}

interface GenerateRouteResponse {
  message: string;
  route: TravelRoute;
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

    if (!response.ok) {
      console.error('❌ HTTP Error:', response.status, response.statusText);
    }

    try {
      const data = JSON.parse(text);
      console.log('✅ API Response:', data);
      return data as T;
    } catch (e) {
      console.error('❌ JSON Parse Error. Response was:', text);
      throw new Error('Server returned non-JSON response. Backend might not be running or endpoint is wrong.');
    }
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
 * @param status - Trạng thái mới: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED'
 * @returns Response với thông tin lộ trình đã cập nhật
 * 
 * Endpoint: PATCH /api/v1/routes/:routeId/status
 * Headers: Authorization: Bearer <token>
 * Request: { status }
 * Response: { message, route }
 */
interface UpdateRouteStatusPayload {
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
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
  status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
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

// ============================================
// EXPORT
// ============================================


// ================= PROFILE APIs =================
/**
 * getProfileAPI: Lấy thông tin cá nhân
 * Endpoint: GET /api/v1/profile
 * @param token - JWT token
 */
const getProfileAPI = async (token: string): Promise<any> => {
  return makeRequest<any>('/api/v1/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

const updateProfileAPI = async (
  token: string,
  data: {
    fullName?: string;
    avatar?: string;
    dob?: string;
    address?: string;
    phone?: string;
    gender?: string;
  }
): Promise<any> => {
  // Nếu avatar là chuỗi rỗng, loại bỏ khỏi payload
  const cleanData = { ...data };
  if (cleanData.avatar === '') {
    delete cleanData.avatar;
  }
  return makeRequest<any>('/api/v1/profile', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cleanData),
  });
};

const changePasswordAPI = async (token: string, data: { currentPassword: string; newPassword: string }): Promise<any> => {
  return makeRequest<any>('/api/v1/profile/password', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
};

const deleteAvatarAPI = async (token: string): Promise<any> => {
  return makeRequest<any>('/api/v1/profile/avatar', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};


// Export default and named exports after all declarations
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
  getProfileAPI,
  updateProfileAPI,
  changePasswordAPI,
  deleteAvatarAPI,
};

export {
  getProfileAPI,
  updateProfileAPI,
  changePasswordAPI,
  deleteAvatarAPI,
};
