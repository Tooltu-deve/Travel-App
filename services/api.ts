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
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('🌐 API Request:', url, options);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'ReactNative', // Bypass Ngrok browser warning
        ...options.headers,
      },
    });

    // Check if response is ok
    if (!response.ok) {
      console.error('❌ HTTP Error:', response.status, response.statusText);
    }

    // Get response text first to debug
    const text = await response.text();
    console.log('📄 Response Text:', text.substring(0, 200)); // First 200 chars

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(text);
      console.log('✅ API Response:', data);
    } catch (e) {
      console.error('❌ JSON Parse Error. Response was:', text);
      throw new Error('Server returned non-JSON response. Backend might not be running or endpoint is wrong.');
    }

    return data;
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
