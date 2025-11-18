# Travel App - API Documentation

> Chi tiết đầy đủ về các API endpoints, request/response formats, và ví dụ sử dụng.

**Version:** 1.0.0  
**Base URL (Backend):** `http://localhost:3000`  
**Base URL (AI Optimizer):** `http://localhost:5000`

---

## Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [User/Profile APIs](#userprofile-apis)
3. [Place APIs](#place-apis)
4. [Itinerary APIs](#itinerary-apis)
5. [AI Optimizer APIs](#ai-optimizer-apis)
6. [Error Responses](#error-responses)
7. [Rate Limiting](#rate-limiting)

---

## Authentication APIs

### 1.1 Register New User

Đăng ký người dùng mới với email và password.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "displayName": "John Doe"
}
```

**Validation Rules:**
- `email`: Valid email format, unique
- `password`: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number
- `displayName`: Optional, max 100 characters

**Success Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "displayName": "John Doe",
    "photoURL": null,
    "createdAt": "2025-11-18T08:00:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input data
- `409 Conflict`: Email already exists

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "displayName": "John Doe"
  }'
```

---

### 1.2 Login

Đăng nhập với email và password.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "displayName": "John Doe",
    "photoURL": null
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials
- `404 Not Found`: User not found

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

---

### 1.3 Google OAuth Login

Khởi động OAuth flow với Google.

**Endpoint:** `GET /auth/google`

**Flow:**
```
1. Client redirects to: GET /auth/google
2. User authenticates with Google
3. Google redirects to: GET /auth/google/callback?code=...
4. Backend returns access_token
```

**Callback Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439012",
    "email": "user@gmail.com",
    "displayName": "John Doe",
    "photoURL": "https://lh3.googleusercontent.com/...",
    "googleId": "1234567890"
  }
}
```

**Example (Browser):**
```
http://localhost:3000/auth/google
```

---

## User/Profile APIs

### 2.1 Get User Profile

Lấy thông tin profile của user hiện tại.

**Endpoint:** `GET /profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "displayName": "John Doe",
  "photoURL": "https://example.com/avatar.jpg",
  "createdAt": "2025-11-18T08:00:00.000Z",
  "updatedAt": "2025-11-18T10:30:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing token

**Example (cURL):**
```bash
curl -X GET http://localhost:3000/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2.2 Update Profile

Cập nhật thông tin profile.

**Endpoint:** `PATCH /profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body (Partial Update):**
```json
{
  "displayName": "Jane Doe",
  "photoURL": "https://example.com/new-avatar.jpg"
}
```

**Success Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "displayName": "Jane Doe",
  "photoURL": "https://example.com/new-avatar.jpg",
  "updatedAt": "2025-11-18T11:00:00.000Z"
}
```

**Example (cURL):**
```bash
curl -X PATCH http://localhost:3000/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Jane Doe"
  }'
```

---

### 2.3 Change Password

Đổi mật khẩu cho user.

**Endpoint:** `POST /profile/change-password`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword456!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Current password is incorrect
- `400 Bad Request`: New password does not meet requirements

---

### 2.4 Change Email

Đổi email cho user.

**Endpoint:** `POST /profile/change-email`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "newEmail": "newemail@example.com",
  "password": "CurrentPassword123!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Email changed successfully",
  "newEmail": "newemail@example.com"
}
```

**Error Responses:**
- `401 Unauthorized`: Password is incorrect
- `409 Conflict`: Email already exists

---

### 2.5 Delete Account

Xóa tài khoản người dùng.

**Endpoint:** `DELETE /profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "password": "CurrentPassword123!",
  "confirmation": "DELETE"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Account deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Password is incorrect
- `400 Bad Request`: Confirmation does not match

---

## Place APIs

### 3.1 Get All Places

Lấy danh sách tất cả places với pagination.

**Endpoint:** `GET /places`

**Query Parameters:**
- `page` (optional): Page number, default: 1
- `limit` (optional): Items per page, default: 20, max: 100

**Success Response (200 OK):**
```json
{
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "google_place_id": "ChIJb_ySWWz_ZTERBYZp9JE4GFE",
      "name": "Cầu Rồng",
      "formatted_address": "Bạch Đằng, Hải Châu 1, Hải Châu, Đà Nẵng",
      "location": {
        "lat": 16.0611,
        "lng": 108.2275
      },
      "rating": 4.5,
      "user_ratings_total": 15342,
      "types": ["tourist_attraction", "point_of_interest"],
      "price_level": 0,
      "emotional_tags": {
        "modern": 0.9,
        "vibrant": 0.8,
        "exciting": 0.7
      }
    }
  ]
}
```

**Example (cURL):**
```bash
curl -X GET "http://localhost:3000/places?page=1&limit=20"
```

---

### 3.2 Search Places

Tìm kiếm places với filters nâng cao.

**Endpoint:** `GET /places/search`

**Query Parameters:**
- `city` (optional): Filter by city name (e.g., "Danang", "Hanoi")
- `types` (optional): Comma-separated types (e.g., "tourist_attraction,museum")
- `budget` (optional): Price level filter (0-4)
  - 0: Free
  - 1: Inexpensive
  - 2: Moderate
  - 3: Expensive
  - 4: Very Expensive
- `radius` (optional): Radius in meters from a center point
- `lat` (optional): Center latitude (required if radius is provided)
- `lng` (optional): Center longitude (required if radius is provided)
- `minRating` (optional): Minimum rating (0-5)
- `page` (optional): Page number, default: 1
- `limit` (optional): Items per page, default: 20

**Example Request:**
```
GET /places/search?city=Danang&types=tourist_attraction&budget=2&radius=5000&lat=16.0544&lng=108.2022&minRating=4.0
```

**Success Response (200 OK):**
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "filters": {
    "city": "Danang",
    "types": ["tourist_attraction"],
    "budget": 2,
    "radius": 5000,
    "center": {
      "lat": 16.0544,
      "lng": 108.2022
    },
    "minRating": 4.0
  },
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "google_place_id": "ChIJ...",
      "name": "Bãi biển Mỹ Khê",
      "formatted_address": "Mỹ Khê, Ngũ Hành Sơn, Đà Nẵng",
      "location": {
        "lat": 16.0406,
        "lng": 108.2455
      },
      "rating": 4.6,
      "user_ratings_total": 25000,
      "types": ["tourist_attraction", "natural_feature"],
      "price_level": 0,
      "emotional_tags": {
        "peaceful": 0.8,
        "relaxing": 0.9,
        "beautiful": 0.85
      },
      "opening_hours": {
        "open_now": true,
        "weekdayDescriptions": [
          "Monday: Open 24 hours",
          "Tuesday: Open 24 hours",
          "..."
        ]
      },
      "distance": 2450.5
    }
  ]
}
```

**Example (cURL):**
```bash
curl -X GET "http://localhost:3000/places/search?city=Danang&budget=2&radius=5000&lat=16.0544&lng=108.2022"
```

---

### 3.3 Get Place by ID

Lấy chi tiết đầy đủ của một place.

**Endpoint:** `GET /places/:id`

**Path Parameters:**
- `id`: MongoDB ObjectId hoặc Google Place ID

**Success Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "google_place_id": "ChIJb_ySWWz_ZTERBYZp9JE4GFE",
  "name": "Cầu Rồng",
  "formatted_address": "Bạch Đằng, Hải Châu 1, Hải Châu, Đà Nẵng",
  "location": {
    "lat": 16.0611,
    "lng": 108.2275
  },
  "rating": 4.5,
  "user_ratings_total": 15342,
  "types": ["tourist_attraction", "point_of_interest"],
  "price_level": 0,
  "emotional_tags": {
    "modern": 0.9,
    "vibrant": 0.8,
    "exciting": 0.7,
    "touristy": 0.85
  },
  "opening_hours": {
    "open_now": true,
    "periods": [
      {
        "open": { "day": 0, "time": "0000" },
        "close": { "day": 0, "time": "2359" }
      }
    ],
    "weekdayDescriptions": [
      "Monday: Open 24 hours",
      "Tuesday: Open 24 hours",
      "..."
    ]
  },
  "photos": [
    {
      "photo_reference": "AeJbb3f...",
      "height": 3024,
      "width": 4032
    }
  ],
  "reviews": [
    {
      "author_name": "Nguyen Van A",
      "rating": 5,
      "text": "Cầu Rồng rất đẹp, đặc biệt là về đêm khi có phun lửa và nước.",
      "time": 1699000000
    }
  ],
  "visit_duration_minutes": 60,
  "city": "Danang",
  "createdAt": "2025-11-01T08:00:00.000Z",
  "updatedAt": "2025-11-18T10:30:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Place not found

**Example (cURL):**
```bash
curl -X GET "http://localhost:3000/places/507f1f77bcf86cd799439011"
```

---

### 3.4 Create Place (Admin Only)

Tạo place mới trong database.

**Endpoint:** `POST /places`

**Headers:**
```
Authorization: Bearer <admin_access_token>
```

**Request Body:**
```json
{
  "google_place_id": "ChIJ...",
  "name": "Bảo tàng Chăm",
  "formatted_address": "02 Tháng 9, Bình Hiên, Hải Châu, Đà Nẵng",
  "location": {
    "lat": 16.0619,
    "lng": 108.2227
  },
  "rating": 4.3,
  "user_ratings_total": 5000,
  "types": ["museum", "tourist_attraction"],
  "price_level": 1,
  "city": "Danang"
}
```

**Success Response (201 Created):**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "google_place_id": "ChIJ...",
  "name": "Bảo tàng Chăm",
  "createdAt": "2025-11-18T12:00:00.000Z"
}
```

---

## Itinerary APIs

### 4.1 Create Itinerary

Tạo lộ trình du lịch tối ưu dựa trên preferences của user.

**Endpoint:** `POST /itinerary/create`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "city": "Danang",
  "duration_days": 3,
  "user_mood": "Yên tĩnh & Thư giãn",
  "budget": 2,
  "current_location": {
    "lat": 16.0544,
    "lng": 108.2022
  },
  "start_datetime": "2025-11-25T08:00:00+07:00",
  "radius_km": 10,
  "ecs_score_threshold": 0.0
}
```

**Parameters:**
- `city`: Tên thành phố (required)
- `duration_days`: Số ngày du lịch (1-14) (required)
- `user_mood`: Mood để tính ECS (required)
  - Available moods:
    - "Yên tĩnh & Thư giãn"
    - "Náo nhiệt & Xã hội"
    - "Lãng mạn & Riêng tư"
    - "Đắt đỏ & Sang trọng"
    - "Đáng tiền & Giá rẻ"
    - "Điểm thu hút khách du lịch"
    - "Mạo hiểm & Thú vị"
    - "Gia đình & Thoải mái"
    - "Hiện đại & Sáng tạo"
    - "Tâm linh & Tôn giáo"
    - "Địa phương & Đích thực"
- `budget`: Price level (0-4) (optional)
- `current_location`: Vị trí hiện tại { lat, lng } (required)
- `start_datetime`: Thời gian bắt đầu (ISO 8601) (required)
- `radius_km`: Bán kính tìm kiếm (km) (optional, default: 20)
- `ecs_score_threshold`: Ngưỡng ECS tối thiểu (optional, default: 0.0)

**Success Response (201 Created):**
```json
{
  "itinerary_id": "507f1f77bcf86cd799439014",
  "user_id": "507f1f77bcf86cd799439011",
  "city": "Danang",
  "duration_days": 3,
  "user_mood": "Yên tĩnh & Thư giãn",
  "optimized_route": [
    {
      "day": 1,
      "day_start_time": "2025-11-25T08:00:00+07:00",
      "activities": [
        {
          "google_place_id": "ChIJ...",
          "name": "Bãi biển Mỹ Khê",
          "location": {
            "lat": 16.0406,
            "lng": 108.2455
          },
          "ecs_score": 1.85,
          "estimated_arrival": "2025-11-25T08:20:00+07:00",
          "estimated_departure": "2025-11-25T10:20:00+07:00",
          "visit_duration_minutes": 120,
          "emotional_tags": {
            "peaceful": 0.8,
            "relaxing": 0.9,
            "quiet": 0.7
          }
        },
        {
          "google_place_id": "ChIJ...",
          "name": "Bán đảo Sơn Trà",
          "location": {
            "lat": 16.1068,
            "lng": 108.2686
          },
          "ecs_score": 1.72,
          "estimated_arrival": "2025-11-25T10:50:00+07:00",
          "estimated_departure": "2025-11-25T12:50:00+07:00",
          "visit_duration_minutes": 120,
          "emotional_tags": {
            "peaceful": 0.85,
            "natural": 0.9,
            "quiet": 0.75
          }
        },
        {
          "google_place_id": "ChIJ...",
          "name": "Chùa Linh Ứng",
          "ecs_score": 1.65,
          "estimated_arrival": "2025-11-25T13:10:00+07:00",
          "estimated_departure": "2025-11-25T14:40:00+07:00",
          "visit_duration_minutes": 90
        },
        {
          "google_place_id": "ChIJ...",
          "name": "Bãi biển Mân Thái",
          "ecs_score": 1.58,
          "estimated_arrival": "2025-11-25T15:00:00+07:00",
          "estimated_departure": "2025-11-25T17:00:00+07:00",
          "visit_duration_minutes": 120
        }
      ]
    },
    {
      "day": 2,
      "day_start_time": "2025-11-26T08:00:00+07:00",
      "activities": [
        "..."
      ]
    },
    {
      "day": 3,
      "day_start_time": "2025-11-27T08:00:00+07:00",
      "activities": [
        "..."
      ]
    }
  ],
  "total_pois": 12,
  "createdAt": "2025-11-18T12:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input data
- `404 Not Found`: No suitable POIs found for the criteria

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/itinerary/create \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Danang",
    "duration_days": 3,
    "user_mood": "Yên tĩnh & Thư giãn",
    "budget": 2,
    "current_location": {
      "lat": 16.0544,
      "lng": 108.2022
    },
    "start_datetime": "2025-11-25T08:00:00+07:00",
    "radius_km": 10
  }'
```

---

### 4.2 Get Itinerary by ID

Lấy chi tiết lộ trình đã tạo.

**Endpoint:** `GET /itinerary/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
- `id`: Itinerary ID

**Success Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "user_id": "507f1f77bcf86cd799439011",
  "city": "Danang",
  "duration_days": 3,
  "user_mood": "Yên tĩnh & Thư giãn",
  "optimized_route": [ "..." ],
  "createdAt": "2025-11-18T12:30:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Itinerary not found
- `403 Forbidden`: Not authorized to access this itinerary

---

### 4.3 Get User's Itineraries

Lấy danh sách lộ trình của user.

**Endpoint:** `GET /itinerary/user/:userId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200 OK):**
```json
{
  "total": 5,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "city": "Danang",
      "duration_days": 3,
      "user_mood": "Yên tĩnh & Thư giãn",
      "createdAt": "2025-11-18T12:30:00.000Z"
    },
    "..."
  ]
}
```

---

### 4.4 Delete Itinerary

Xóa lộ trình.

**Endpoint:** `DELETE /itinerary/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200 OK):**
```json
{
  "message": "Itinerary deleted successfully"
}
```

**Error Responses:**
- `404 Not Found`: Itinerary not found
- `403 Forbidden`: Not authorized to delete this itinerary

---

## AI Optimizer APIs

### 5.1 Optimize Route

Tối ưu lộ trình dựa trên ECS và thời gian di chuyển.

**Endpoint:** `POST /optimize-route`

**Base URL:** `http://localhost:5000` (AI Optimizer Service)

**Request Body:**
```json
{
  "poi_list": [
    {
      "google_place_id": "ChIJ...",
      "name": "Bãi biển Mỹ Khê",
      "location": {
        "lat": 16.0406,
        "lng": 108.2455
      },
      "emotional_tags": {
        "peaceful": 0.8,
        "relaxing": 0.9,
        "quiet": 0.7
      },
      "opening_hours": {
        "periods": [ "..." ],
        "weekdayDescriptions": [ "..." ]
      },
      "visit_duration_minutes": 120
    }
  ],
  "user_mood": "Yên tĩnh & Thư giãn",
  "duration_days": 3,
  "current_location": {
    "lat": 16.0544,
    "lng": 108.2022
  },
  "start_datetime": "2025-11-25T08:00:00+07:00",
  "ecs_score_threshold": 0.0,
  "eta_matrix": {
    "ChIJ_poi1": {
      "ChIJ_poi2": 15.5,
      "ChIJ_poi3": 22.3
    }
  },
  "eta_from_current": {
    "ChIJ_poi1": 12.0,
    "ChIJ_poi2": 18.5
  }
}
```

**Success Response (200 OK):**
```json
{
  "optimized_route": [
    {
      "day": 1,
      "day_start_time": "2025-11-25T08:00:00+07:00",
      "activities": [
        {
          "google_place_id": "ChIJ...",
          "name": "Bãi biển Mỹ Khê",
          "ecs_score": 1.85,
          "estimated_arrival": "2025-11-25T08:20:00+07:00",
          "estimated_departure": "2025-11-25T10:20:00+07:00"
        }
      ]
    }
  ]
}
```

**Algorithm Details:**
1. **Step 1:** Lọc POIs đang mở cửa tại thời điểm khởi hành
2. **Step 2:** Tính ECS score cho các POIs (Σ emotional_tag × mood_weight)
3. **Step 3:** Lọc POIs có ECS > threshold
4. **Step 4:** Sắp xếp theo ECS (giảm dần)
5. **Step 5:** Phân bổ vào các ngày (4 POIs/ngày)
6. **Step 6:** Tối ưu thứ tự thăm bằng Nearest Neighbor heuristic
7. **Step 7:** Tính estimated arrival/departure times

**Example (cURL):**
```bash
curl -X POST http://localhost:5000/optimize-route \
  -H "Content-Type: application/json" \
  -d '{
    "poi_list": [...],
    "user_mood": "Yên tĩnh & Thư giãn",
    "duration_days": 3,
    "current_location": {"lat": 16.0544, "lng": 108.2022},
    "start_datetime": "2025-11-25T08:00:00+07:00"
  }'
```

---

## Error Responses

### Standard Error Format

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request",
  "timestamp": "2025-11-18T12:00:00.000Z",
  "path": "/auth/login"
}
```

### Common Error Codes

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| 400 | Bad Request | Invalid input data or parameters |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | User doesn't have permission |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists (e.g., duplicate email) |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | External service (AI Optimizer, Google APIs) unavailable |

### Validation Errors

```json
{
  "statusCode": 422,
  "message": [
    "email must be a valid email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Unprocessable Entity"
}
```

---

## Rate Limiting

### Backend API (NestJS)

**Limits:**
- **Anonymous users:** 100 requests per 15 minutes
- **Authenticated users:** 1000 requests per 15 minutes
- **Search endpoints:** 50 requests per minute
- **Itinerary creation:** 10 requests per hour

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700308800
```

**Error Response (429):**
```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again later.",
  "error": "Too Many Requests",
  "retryAfter": 900
}
```

### AI Optimizer API

**Limits:**
- 100 requests per hour per IP

---

## Authentication

### JWT Token Format

**Header:**
```
Authorization: Bearer <access_token>
```

**Token Payload:**
```json
{
  "sub": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "iat": 1700308800,
  "exp": 1700913600
}
```

**Token Expiration:**
- **Default:** 7 days
- **Refresh:** Not yet implemented (recommended)

---

## Pagination

Standard pagination format for list endpoints:

**Query Parameters:**
- `page`: Page number (default: 1, min: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response Format:**
```json
{
  "total": 150,
  "page": 2,
  "limit": 20,
  "totalPages": 8,
  "hasNext": true,
  "hasPrev": true,
  "data": [ "..." ]
}
```

---

## Webhooks (Future Feature)

*Not yet implemented*

Planned webhooks for:
- Itinerary creation completed
- User registration
- Place updates

---

## Versioning

**Current Version:** v1

All endpoints are prefixed with `/api/v1` (planned).

Currently, no version prefix is used.

---

## Support

**Issues & Bug Reports:**
- GitHub: `Tooltu-deve/Travel-App/issues`

**Documentation Updates:**
- Last Updated: 18/11/2025
- Version: 1.0.0

---

**End of API Documentation**
