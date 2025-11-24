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
export const API_BASE_URL = 'https://travel-app-r9qu.onrender.com'; // ⬅️ Render Cloud URL
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * @returns ValidateTokenResponse (hoặc profile object)
 * 
 * NOTE: Backend hiện không có endpoint `/api/v1/auth/validate`.
 * Thay vào đó ta gọi `GET /api/v1/users/profile` (route được bảo vệ bởi JwtAuthGuard)
 * để kiểm tra token hợp lệ và lấy profile của user.
 */
export const validateTokenAPI = async (
  token: string
): Promise<ValidateTokenResponse> => {
  return makeRequest<ValidateTokenResponse>('/api/v1/users/profile', {
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
 * generateItineraryAPI: Gọi backend endpoint tạo lộ trình (AI)
 * Endpoint: POST /api/v1/routes/generate
 * Truyền body theo ItineraryRequestDto
 */
export const generateItineraryAPI = async (
  body: any,
  token?: string,
) => {
  // If token not provided, try to read from AsyncStorage (userToken)
  let authToken = token;
  try {
    if (!authToken) {
      // Try common storage keys used across the app
      const keys = ['userToken', 'token', 'access_token', 'accessToken'];
      for (const k of keys) {
        const stored = await AsyncStorage.getItem(k);
        if (stored) {
          authToken = stored;
          console.log(`🔐 Found auth token in AsyncStorage key: ${k}`);
          break;
        }
      }
    }
  } catch (e) {
    // ignore storage read errors
  }

  console.log('🌐 generateItineraryAPI authToken present:', !!authToken);

  return makeRequest<any>('/api/v1/routes/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
};

/**
 * getLikedPlaces: Lấy danh sách địa điểm user đã like
 * @param token - optional JWT token
 * @returns array of places or { places: [...] }
 */
export const getLikedPlaces = async (token?: string) => {
  return makeRequest<any>('/api/v1/users/liked-places', {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

/**
 * likePlaceAPI: toggle like/unlike cho place
 * @param placeId - id của place
 * @param token - optional JWT token
 */
export const likePlaceAPI = async (placeId: string, token?: string) => {
  return makeRequest<any>('/api/v1/users/like-place', {
    method: 'POST',
    body: JSON.stringify({ placeId }),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
};
