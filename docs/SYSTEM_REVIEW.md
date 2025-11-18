# Hệ Thống Travel App - Tài Liệu Tổng Quan (System Review)

> Tài liệu này cung cấp cái nhìn toàn diện về hệ thống Travel App, bao gồm kiến trúc, các thành phần, luồng dữ liệu và chức năng chi tiết.

**Ngày tạo:** 18/11/2025  
**Phiên bản:** 1.0.0

---

## 📋 Mục Lục

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Kiến Trúc Hệ Thống](#2-kiến-trúc-hệ-thống)
3. [Backend - NestJS API](#3-backend---nestjs-api)
4. [Frontend - React Native/Expo](#4-frontend---react-nativeexpo)
5. [AI Optimizer Service](#5-ai-optimizer-service)
6. [Data Processing Service](#6-data-processing-service)
7. [Cơ Sở Dữ Liệu](#7-cơ-sở-dữ-liệu)
8. [Luồng Dữ Liệu](#8-luồng-dữ-liệu)
9. [API Endpoints](#9-api-endpoints)
10. [Quy Ước Code](#10-quy-ước-code)
11. [Deployment](#11-deployment)
12. [Bảo Mật](#12-bảo-mật)
13. [Tối Ưu Hóa & Performance](#13-tối-ưu-hóa--performance)

---

## 1. Tổng Quan Hệ Thống

### 1.1 Giới Thiệu

**Travel App** là một ứng dụng du lịch thông minh được xây dựng trên kiến trúc microservices, cung cấp các tính năng:

- 🗺️ **Tìm kiếm địa điểm du lịch (POI)** với bộ lọc thông minh
- 🤖 **Tối ưu hóa lộ trình du lịch bằng AI** dựa trên cảm xúc người dùng (Emotional Compatibility Score - ECS)
- 👤 **Quản lý người dùng** với xác thực đa kênh (Email/Password, Google OAuth)
- 📅 **Lập kế hoạch hành trình** tự động theo số ngày và ngân sách
- ⭐ **Đánh giá và yêu thích địa điểm**
- 📊 **Phân tích cảm xúc từ đánh giá** sử dụng PhoBERT (Vietnamese BERT)

### 1.2 Công Nghệ Sử Dụng

| Thành Phần | Công Nghệ | Phiên Bản |
|-----------|-----------|-----------|
| **Backend API** | NestJS, TypeScript | v10.x |
| **Frontend Mobile** | React Native, Expo | v54.x, React 19.x |
| **AI Service** | Python, FastAPI | 3.x |
| **Data Processing** | Python, PhoBERT, PyTorch | - |
| **Database** | MongoDB | v8.x |
| **Authentication** | Passport, JWT | - |
| **Styling (Mobile)** | NativeWind, Tailwind CSS | v4.x |
| **Maps & Location** | Google Maps APIs | - |

---

## 2. Kiến Trúc Hệ Thống

### 2.1 Sơ Đồ Kiến Trúc Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                 │
│  📱 Expo App (React Native 19.x + NativeWind/Tailwind)         │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/HTTPS Requests
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API GATEWAY LAYER                              │
│  🔧 NestJS Backend Core (TypeScript)                            │
│     - Authentication & Authorization (JWT, Passport)            │
│     - API Orchestration & Business Logic                        │
│     - Input Validation & Error Handling                         │
└───────┬──────────────────┬──────────────────┬───────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   MongoDB    │  │ AI Optimizer │  │  Google Maps APIs    │
│   Database   │  │   Service    │  │  - Distance Matrix   │
│              │  │ (FastAPI)    │  │  - Place Details     │
│  User Data   │  │              │  │  - Geocoding         │
│  POI Data    │  │  ECS Score   │  │                      │
│  Itineraries │  │  Route Opt.  │  │                      │
└──────────────┘  └──────┬───────┘  └──────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │     Data     │
                  │  Processing  │
                  │   Service    │
                  │              │
                  │  PhoBERT     │
                  │  Scraping    │
                  └──────────────┘
```

### 2.2 Mô Hình Microservices

Hệ thống được chia thành 4 services độc lập:

1. **Backend Core (NestJS)**: API Gateway và điều phối logic nghiệp vụ
2. **AI Optimizer (FastAPI)**: Tính toán ECS và tối ưu lộ trình
3. **Data Processing (Python)**: Thu thập và phân tích dữ liệu
4. **Database (MongoDB)**: Lưu trữ dữ liệu trung tâm

---

## 3. Backend - NestJS API

### 3.1 Cấu Trúc Thư Mục

```
backend/
├── src/
│   ├── auth/              # Module xác thực
│   │   ├── guards/        # JWT, Local guards
│   │   ├── strategies/    # Passport strategies
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── user/              # Module quản lý người dùng
│   │   ├── schemas/       # Mongoose schemas
│   │   ├── dto/           # Data Transfer Objects
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   └── user.module.ts
│   ├── place/             # Module địa điểm POI
│   │   ├── schemas/       # Place schema
│   │   ├── dto/           # Search, Create, Update DTOs
│   │   ├── place.controller.ts
│   │   ├── place.service.ts
│   │   └── place.module.ts
│   ├── itinerary/         # Module lộ trình du lịch
│   │   ├── dto/           # Itinerary DTOs
│   │   ├── itinerary.controller.ts
│   │   ├── itinerary.service.ts
│   │   └── itinerary.module.ts
│   ├── profile/           # Module hồ sơ người dùng
│   │   ├── dto/           # Profile DTOs
│   │   ├── profile.controller.ts
│   │   ├── profile.service.ts
│   │   └── profile.module.ts
│   ├── config/            # Cấu hình môi trường
│   ├── database/          # Database connection
│   ├── app.module.ts      # Root module
│   ├── main.ts            # Entry point
│   └── seeder.ts          # Database seeding
├── package.json
├── tsconfig.json
└── nest-cli.json
```

### 3.2 Modules Chi Tiết

#### 3.2.1 Auth Module

**Chức năng:**
- Đăng ký người dùng mới (email/password)
- Đăng nhập (Local Strategy)
- OAuth với Google
- Quản lý JWT tokens

**Strategies:**
- `LocalStrategy`: Xác thực bằng email/password
- `JwtStrategy`: Xác thực bằng JWT token
- `GoogleStrategy`: OAuth 2.0 với Google

**Guards:**
- `JwtAuthGuard`: Bảo vệ các routes cần xác thực
- `LocalAuthGuard`: Xử lý login

**Key Files:**
- `auth.controller.ts`: Endpoints `/auth/register`, `/auth/login`, `/auth/google`
- `auth.service.ts`: Logic xác thực và tạo token

#### 3.2.2 User Module

**Chức năng:**
- CRUD operations cho User
- Tìm kiếm user theo email, provider ID
- Quản lý profile cơ bản

**Schema (MongoDB):**
```typescript
{
  email: string (unique, required)
  password: string (hashed, optional)
  googleId: string (optional)
  displayName: string
  photoURL: string
  createdAt: Date
  updatedAt: Date
}
```

#### 3.2.3 Place Module

**Chức năng:**
- Tìm kiếm địa điểm du lịch (POI) với bộ lọc:
  - Theo thành phố
  - Theo loại địa điểm (category)
  - Theo ngân sách (budget)
  - Theo bán kính (radius)
- CRUD operations cho Places
- Seeding dữ liệu từ Google Places API

**Schema (MongoDB):**
```typescript
{
  google_place_id: string (unique, required)
  name: string
  formatted_address: string
  location: {
    lat: number
    lng: number
  }
  rating: number
  user_ratings_total: number
  types: string[]
  emotional_tags: {
    [tag_name: string]: number  // Ví dụ: "peaceful": 0.8
  }
  price_level: number (0-4)
  opening_hours: {
    periods: Array
    weekdayDescriptions: string[]
  }
  photos: Array
  reviews: Array
  visit_duration_minutes: number
  city: string
  createdAt: Date
  updatedAt: Date
}
```

#### 3.2.4 Itinerary Module

**Chức năng:**
- Tạo lộ trình du lịch tối ưu bằng cách:
  1. Lọc POIs theo điều kiện người dùng (city, budget, radius)
  2. Gửi danh sách POIs đến AI Optimizer Service
  3. Nhận lộ trình đã được tối ưu hóa theo ECS và thời gian di chuyển

**Flow:**
```
Client → NestJS Backend → MongoDB (lấy POIs)
                       → AI Optimizer (tối ưu lộ trình)
                       → Client (trả về daily plan)
```

#### 3.2.5 Profile Module

**Chức năng:**
- Xem và cập nhật profile người dùng
- Đổi mật khẩu
- Đổi email
- Xóa tài khoản

### 3.3 Dependencies Chính

```json
{
  "@nestjs/axios": "^3.0.2",
  "@nestjs/common": "^10.0.0",
  "@nestjs/config": "^3.2.2",
  "@nestjs/jwt": "^10.2.0",
  "@nestjs/mongoose": "^10.0.6",
  "@nestjs/passport": "^10.0.3",
  "bcrypt": "^5.1.1",
  "passport-google-oauth20": "^2.0.0",
  "passport-jwt": "^4.0.1",
  "mongoose": "^8.3.3"
}
```

### 3.4 Scripts

```bash
npm run start:dev    # Chạy development với watch mode
npm run build        # Build production
npm run start:prod   # Chạy production
npm run lint         # Lint code với ESLint
npm run seed         # Seed database với dữ liệu mẫu
```

---

## 4. Frontend - React Native/Expo

### 4.1 Cấu Trúc Thư Mục

```
frontend/
├── app/
│   ├── (auth)/            # Nhóm routes xác thực
│   │   ├── login/
│   │   │   ├── index.tsx
│   │   │   └── _LoginScreen.tsx
│   │   ├── register/
│   │   │   ├── index.tsx
│   │   │   └── _RegisterScreen.tsx
│   │   └── _layout.tsx
│   ├── (tabs)/            # Nhóm routes tab navigation
│   │   ├── index.tsx      # Home/Explore screen
│   │   ├── favorites.tsx  # Yêu thích
│   │   ├── itinerary.tsx  # Lộ trình
│   │   ├── notifications.tsx  # Thông báo
│   │   ├── profile.tsx    # Hồ sơ
│   │   └── _layout.tsx
│   ├── _layout.tsx        # Root layout
│   ├── index.tsx          # Entry point
│   ├── global.css         # Global styles
│   └── mockData.ts        # Mock data cho development
├── components/            # Reusable components
├── services/              # API services
├── contexts/              # React contexts
├── constants/             # Constants và configs
├── assets/                # Images, fonts, etc.
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── app.json
```

### 4.2 Navigation Structure

Sử dụng **Expo Router** với file-based routing:

```
/                          # Landing/Welcome screen
├── (auth)/
│   ├── login             # Login screen
│   └── register          # Register screen
└── (tabs)/               # Main app với bottom tabs
    ├── index (Home)      # Tìm kiếm và khám phá POIs
    ├── favorites         # Danh sách yêu thích
    ├── itinerary         # Lộ trình đã tạo
    ├── notifications     # Thông báo
    └── profile           # Hồ sơ người dùng
```

### 4.3 Styling với NativeWind

Frontend sử dụng **NativeWind** (TailwindCSS cho React Native):

```tsx
// Example component with NativeWind
<View className="flex-1 bg-white p-4">
  <Text className="text-2xl font-bold text-gray-800">
    Welcome to Travel App
  </Text>
  <TouchableOpacity className="bg-blue-500 rounded-lg px-6 py-3 mt-4">
    <Text className="text-white font-semibold">Get Started</Text>
  </TouchableOpacity>
</View>
```

### 4.4 Dependencies Chính

```json
{
  "expo": "~54.0.19",
  "expo-router": "~6.0.13",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "nativewind": "^4.2.1",
  "tailwindcss": "^3.4.18",
  "@react-navigation/native": "^7.1.8",
  "@react-navigation/bottom-tabs": "^7.4.0"
}
```

### 4.5 Scripts

```bash
npm start           # Khởi động Expo development server
npm run android     # Chạy trên Android
npm run ios         # Chạy trên iOS
npm run web         # Chạy trên web browser
npm run lint        # Lint code
```

---

## 5. AI Optimizer Service

### 5.1 Tổng Quan

Service Python/FastAPI chuyên trách:
1. **Tính ECS (Emotional Compatibility Score)** cho mỗi POI dựa trên mood người dùng
2. **Tối ưu lộ trình** với thuật toán Nearest Neighbor heuristic
3. **Kiểm tra giờ mở cửa** của POIs

### 5.2 Cấu Trúc File

```
ai_optimizer_servive/
├── main.py              # FastAPI application
└── requirements.txt     # Python dependencies
```

### 5.3 ECS Calculation Algorithm

**Công thức ECS:**
```
ECS_score = Σ (emotional_tag_value × mood_weight)
```

**Mood Weights:**
- `"Yên tĩnh & Thư giãn"`: Ưu tiên "quiet", "peaceful", "relaxing"
- `"Náo nhiệt & Xã hội"`: Ưu tiên "lively", "crowded", "vibrant"
- `"Lãng mạn & Riêng tư"`: Ưu tiên "romantic", "good for couples", "quiet"
- `"Đắt đỏ & Sang trọng"`: Ưu tiên "expensive", "luxury", "high-end"
- `"Đáng tiền & Giá rẻ"`: Ưu tiên "cheap", "affordable", "good value"
- `"Điểm thu hút khách du lịch"`: Ưu tiên "touristy", "tourist-friendly"
- `"Mạo hiểm & Thú vị"`: Ưu tiên "adventurous", "exciting", "thrilling"
- `"Gia đình & Thoải mái"`: Ưu tiên "family-friendly", "cozy", "comfortable"
- `"Hiện đại & Sáng tạo"`: Ưu tiên "modern", "creative", "artistic"
- `"Tâm linh & Tôn giáo"`: Ưu tiên "spiritual", "religious", "faith"
- `"Địa phương & Đích thực"`: Ưu tiên "local gem", "authentic", "genuine"

### 5.4 Route Optimization Algorithm

**Thuật toán Nearest Neighbor Heuristic:**
```python
1. Lọc POIs đang mở cửa tại thời điểm khởi hành
2. Tính ECS cho các POIs đã lọc
3. Lọc POIs có ECS > threshold
4. Sắp xếp theo ECS (giảm dần)
5. Phân bổ POIs vào các ngày (4 POIs/ngày)
6. Cho mỗi ngày:
   a. Chọn POI gần nhất từ vị trí hiện tại làm điểm đầu tiên
   b. Chọn POI gần nhất từ POI cuối cùng (lặp lại)
   c. Tính thời gian đến (arrival time) cho mỗi POI
   d. Kiểm tra giờ mở cửa tại thời điểm arrival
   e. Tính thời gian rời đi (departure time)
```

### 5.5 API Endpoint

**POST `/optimize-route`**

**Request Body:**
```json
{
  "poi_list": [
    {
      "google_place_id": "ChIJ...",
      "name": "Landmark 81",
      "location": { "lat": 10.7945, "lng": 106.7211 },
      "emotional_tags": {
        "modern": 0.9,
        "expensive": 0.8,
        "crowded": 0.7
      },
      "opening_hours": { ... },
      "visit_duration_minutes": 120
    }
  ],
  "user_mood": "Hiện đại & Sáng tạo",
  "duration_days": 3,
  "current_location": { "lat": 10.7769, "lng": 106.7009 },
  "start_datetime": "2025-11-20T08:00:00+07:00",
  "ecs_score_threshold": 0.0,
  "eta_matrix": { ... },
  "eta_from_current": { ... }
}
```

**Response:**
```json
{
  "optimized_route": [
    {
      "day": 1,
      "day_start_time": "2025-11-20T08:00:00+07:00",
      "activities": [
        {
          "google_place_id": "ChIJ...",
          "name": "Landmark 81",
          "ecs_score": 1.5,
          "estimated_arrival": "2025-11-20T08:30:00+07:00",
          "estimated_departure": "2025-11-20T10:30:00+07:00",
          ...
        }
      ]
    },
    {
      "day": 2,
      "activities": [ ... ]
    }
  ]
}
```

### 5.6 Google Maps Integration

Service sử dụng Google APIs:
- **Distance Matrix API**: Tính thời gian di chuyển giữa các POIs
- **Geocoding API**: Chuyển đổi địa chỉ thành tọa độ

### 5.7 Dependencies

```
fastapi>=0.111.0
uvicorn>=0.30.0
pydantic>=2.8.0
requests>=2.32.0
python-dotenv>=1.0.1
```

---

## 6. Data Processing Service

### 6.1 Tổng Quan

Service Python cho việc:
1. **Scraping POI reviews** từ Google Maps
2. **Phân tích cảm xúc** sử dụng PhoBERT (Vietnamese BERT)
3. **Fine-tuning PhoBERT** cho emotional tag classification
4. **Gán emotional tags** cho POIs

### 6.2 Cấu Trúc File

```
data_processing/
├── scrape_poi_reviews.py          # Scraping reviews từ Google Maps
├── process_emotional_tags.py      # Xử lý và gán emotional tags
├── fine_tune_phoBERT.py           # Fine-tune PhoBERT model
├── support_set.csv                # Few-shot learning support set
├── requirements.txt               # Python dependencies
├── phobert_few_shot_tags_classifier/  # Trained model (few-shot)
└── final_few_shot_phobert_model/     # Trained model (final)
```

### 6.3 PhoBERT Model

**Model:** `vinai/phobert-base` (Vietnamese BERT)

**Task:** Multi-label classification cho emotional tags

**Tags:** 
- quiet, peaceful, relaxing, crowded, lively, vibrant
- romantic, good for couples, expensive, luxury, high-end
- cheap, affordable, good value, touristy, tourist-friendly
- adventurous, exciting, thrilling, family-friendly, cozy
- comfortable, modern, creative, artistic, historical
- traditional, cultural, spiritual, religious, faith
- local gem, authentic, genuine

**Approach:** Few-shot learning với support set

### 6.4 Scraping Process

```python
# Sử dụng Playwright để scrape reviews từ Google Maps
1. Mở Google Maps với google_place_id
2. Scroll để load tất cả reviews
3. Extract text, rating, author, date
4. Lưu vào MongoDB
```

### 6.5 Emotional Tag Processing

```python
1. Load PhoBERT model đã fine-tune
2. Cho mỗi POI:
   a. Lấy tất cả reviews
   b. Dự đoán emotional tags cho mỗi review
   c. Aggregate tags (trung bình hoặc voting)
   d. Lưu emotional_tags vào POI document
```

### 6.6 Dependencies

```
pandas>=2.0.0
transformers>=4.30.0
torch>=2.0.0
datasets>=2.14.0
pymongo>=4.5.0
playwright>=1.40.0
numpy>=1.24.0
evaluate>=0.4.0
accelerate>=0.26.0
```

---

## 7. Cơ Sở Dữ Liệu

### 7.1 MongoDB Collections

#### 7.1.1 Users Collection

```javascript
{
  _id: ObjectId,
  email: String (unique, required),
  password: String (hashed, optional),
  googleId: String (optional),
  displayName: String,
  photoURL: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `email`: unique
- `googleId`: unique (sparse)

#### 7.1.2 Places Collection

```javascript
{
  _id: ObjectId,
  google_place_id: String (unique, required),
  name: String,
  formatted_address: String,
  location: {
    lat: Number,
    lng: Number
  },
  rating: Number,
  user_ratings_total: Number,
  types: [String],
  emotional_tags: {
    "peaceful": Number,
    "quiet": Number,
    "modern": Number,
    // ... các tags khác
  },
  price_level: Number (0-4),
  opening_hours: {
    open_now: Boolean,
    periods: [{
      open: { day: Number, time: String },
      close: { day: Number, time: String }
    }],
    weekdayDescriptions: [String]
  },
  photos: [{
    photo_reference: String,
    height: Number,
    width: Number
  }],
  reviews: [{
    author_name: String,
    rating: Number,
    text: String,
    time: Number
  }],
  visit_duration_minutes: Number,
  city: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `google_place_id`: unique
- `city`: ascending
- `location`: 2dsphere (geospatial)
- `types`: multikey
- `rating`: descending

---

## 8. Luồng Dữ Liệu

### 8.1 User Authentication Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. POST /auth/register or /auth/login
     ▼
┌──────────────────┐
│  Auth Controller │
└────────┬─────────┘
         │ 2. Validate credentials
         ▼
┌──────────────────┐
│  Auth Service    │
└────────┬─────────┘
         │ 3. Hash password / Verify
         │ 4. Generate JWT token
         ▼
┌──────────────────┐
│   User Service   │
└────────┬─────────┘
         │ 5. Find/Create user
         ▼
┌──────────────────┐
│     MongoDB      │
└──────────────────┘
```

### 8.2 Itinerary Generation Flow

```
┌─────────┐
│  User   │ "Tôi muốn đi Đà Nẵng 3 ngày, mood: Yên tĩnh & Thư giãn"
└────┬────┘
     │ 1. POST /itinerary/create
     ▼
┌──────────────────────────┐
│  Itinerary Controller    │
└────────┬─────────────────┘
         │ 2. Parse request
         ▼
┌──────────────────────────┐
│  Itinerary Service       │
└────────┬─────────────────┘
         │ 3. Query POIs (city, budget, radius)
         ▼
┌──────────────────────────┐
│  Place Service           │
└────────┬─────────────────┘
         │ 4. Fetch POIs from MongoDB
         ▼
┌──────────────────────────┐
│      MongoDB             │
└────────┬─────────────────┘
         │ 5. Return filtered POIs
         ▼
┌──────────────────────────┐
│  Itinerary Service       │
└────────┬─────────────────┘
         │ 6. POST /optimize-route
         ▼
┌──────────────────────────┐
│  AI Optimizer Service    │
│  (FastAPI/Python)        │
└────────┬─────────────────┘
         │ 7. Calculate ECS scores
         │ 8. Filter by ECS threshold
         │ 9. Optimize route (Nearest Neighbor)
         │ 10. Check opening hours
         ▼
┌──────────────────────────┐
│  Google Maps APIs        │
│  - Distance Matrix       │
└────────┬─────────────────┘
         │ 11. Return ETA data
         ▼
┌──────────────────────────┐
│  AI Optimizer Service    │
└────────┬─────────────────┘
         │ 12. Return optimized route
         ▼
┌──────────────────────────┐
│  Itinerary Service       │
└────────┬─────────────────┘
         │ 13. Return daily plan to client
         ▼
┌──────────────────────────┐
│  User (Mobile App)       │
└──────────────────────────┘
```

### 8.3 POI Search Flow

```
┌─────────┐
│  User   │ "Tìm địa điểm ở Hà Nội"
└────┬────┘
     │ 1. GET /places/search?city=Hanoi
     ▼
┌──────────────────────────┐
│  Place Controller        │
└────────┬─────────────────┘
         │ 2. Validate query params
         ▼
┌──────────────────────────┐
│  Place Service           │
└────────┬─────────────────┘
         │ 3. Build MongoDB query
         │    - city filter
         │    - type filter
         │    - budget filter (price_level)
         │    - radius filter (geospatial)
         ▼
┌──────────────────────────┐
│      MongoDB             │
└────────┬─────────────────┘
         │ 4. Return matching POIs
         ▼
┌──────────────────────────┐
│  Place Service           │
└────────┬─────────────────┘
         │ 5. Sort by rating/relevance
         │ 6. Return paginated results
         ▼
┌──────────────────────────┐
│  User (Mobile App)       │
└──────────────────────────┘
```

---

## 9. API Endpoints

### 9.1 Authentication APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Đăng ký người dùng mới | ❌ |
| POST | `/auth/login` | Đăng nhập với email/password | ❌ |
| GET | `/auth/google` | Khởi động OAuth flow | ❌ |
| GET | `/auth/google/callback` | Callback từ Google OAuth | ❌ |

**Example: Register**
```bash
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

### 9.2 User/Profile APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/profile` | Lấy thông tin profile | ✅ JWT |
| PATCH | `/profile` | Cập nhật profile | ✅ JWT |
| POST | `/profile/change-password` | Đổi mật khẩu | ✅ JWT |
| POST | `/profile/change-email` | Đổi email | ✅ JWT |
| DELETE | `/profile` | Xóa tài khoản | ✅ JWT |

### 9.3 Place APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/places` | Lấy danh sách places | ❌ |
| GET | `/places/search` | Tìm kiếm places với filters | ❌ |
| GET | `/places/:id` | Lấy chi tiết place | ❌ |
| POST | `/places` | Tạo place mới | ✅ Admin |
| PATCH | `/places/:id` | Cập nhật place | ✅ Admin |
| DELETE | `/places/:id` | Xóa place | ✅ Admin |

**Example: Search Places**
```bash
GET /places/search?city=Danang&types=tourist_attraction&budget=2&radius=5000
```

**Response:**
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "google_place_id": "ChIJb_ySWWz_ZTERBYZp9JE4GFE",
      "name": "Cầu Rồng",
      "formatted_address": "Bạch Đằng, Hải Châu 1, Hải Châu, Đà Nẵng",
      "location": { "lat": 16.0611, "lng": 108.2275 },
      "rating": 4.5,
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

### 9.4 Itinerary APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/itinerary/create` | Tạo lộ trình tối ưu | ✅ JWT |
| GET | `/itinerary/:id` | Lấy chi tiết lộ trình | ✅ JWT |
| GET | `/itinerary/user/:userId` | Lấy lộ trình của user | ✅ JWT |
| DELETE | `/itinerary/:id` | Xóa lộ trình | ✅ JWT |

**Example: Create Itinerary**
```bash
POST /itinerary/create
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "city": "Danang",
  "duration_days": 3,
  "user_mood": "Yên tĩnh & Thư giãn",
  "budget": 2,
  "current_location": { "lat": 16.0544, "lng": 108.2022 },
  "start_datetime": "2025-11-25T08:00:00+07:00",
  "radius_km": 10
}
```

**Response:**
```json
{
  "itinerary_id": "507f1f77bcf86cd799439012",
  "optimized_route": [
    {
      "day": 1,
      "day_start_time": "2025-11-25T08:00:00+07:00",
      "activities": [
        {
          "google_place_id": "ChIJ...",
          "name": "Bãi biển Mỹ Khê",
          "ecs_score": 1.8,
          "estimated_arrival": "2025-11-25T08:20:00+07:00",
          "estimated_departure": "2025-11-25T10:20:00+07:00",
          "visit_duration_minutes": 120
        }
      ]
    }
  ]
}
```

---

## 10. Quy Ước Code

Tham khảo file chi tiết: [`docs/coding_convention.md`](./coding_convention.md)

### 10.1 Naming Conventions

- **Components (React Native)**: PascalCase (e.g., `TravelCard.tsx`)
- **Files và Folders**: camelCase (e.g., `hotelCard/`)
- **Variables và Functions**: camelCase (e.g., `calculateTotalPrice`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)
- **Types và Interfaces**: PascalCase (e.g., `HotelBooking`)

### 10.2 Git Workflow

**Branch Structure:**
```
main
├── develop
    ├── feature/user-authentication
    ├── feature/hotel-booking
    └── hotfix/critical-bug-fix
```

**Commit Convention:**
```
<type>(<scope>): <description>

feat(auth): add login with Google OAuth
fix(booking): resolve date validation issue
docs: update API documentation
```

---

## 11. Deployment

### 11.1 Environment Variables

#### Backend (NestJS)
```env
# Database
MONGODB_URI=mongodb://localhost:27017/travel-app

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# AI Optimizer Service
AI_OPTIMIZER_BASE_URL=http://localhost:5000
```

#### AI Optimizer (Python)
```env
# Google Maps APIs
GOOGLE_DISTANCE_MATRIX_API_KEY=your-api-key
GOOGLE_GEOCODING_API_KEY=your-api-key
```

#### Frontend (Expo)
```env
API_BASE_URL=http://localhost:3000
```

### 11.2 Docker Deployment (Đề xuất)

```yaml
# docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/travel-app
    depends_on:
      - mongodb

  ai-optimizer:
    build: ./ai_optimizer_servive
    ports:
      - "5000:5000"
    environment:
      - GOOGLE_DISTANCE_MATRIX_API_KEY=${GOOGLE_API_KEY}

volumes:
  mongo-data:
```

### 11.3 Production Deployment

**Đề xuất:**
- **Backend**: Deploy trên AWS EC2, Heroku, hoặc DigitalOcean
- **AI Optimizer**: Deploy trên AWS Lambda (serverless) hoặc Google Cloud Run
- **Database**: MongoDB Atlas (managed service)
- **Frontend**: Expo Application Services (EAS) hoặc publish to App Store/Play Store

---

## 12. Bảo Mật

### 12.1 Authentication & Authorization

- ✅ **JWT-based authentication** với expiration
- ✅ **Password hashing** với bcrypt (salt rounds: 10)
- ✅ **Google OAuth 2.0** integration
- ✅ **JWT refresh tokens** (khuyến nghị triển khai)
- ✅ **Route guards** (JwtAuthGuard) bảo vệ protected endpoints

### 12.2 Input Validation

- ✅ **class-validator** và **class-transformer** cho DTOs
- ✅ Validation pipes trong NestJS
- ✅ Sanitize user inputs để ngăn chặn injection attacks

### 12.3 Secure Headers

**Khuyến nghị sử dụng Helmet:**
```typescript
import helmet from 'helmet';
app.use(helmet());
```

### 12.4 CORS Configuration

```typescript
app.enableCors({
  origin: ['http://localhost:8081', 'https://yourdomain.com'],
  credentials: true,
});
```

### 12.5 API Keys Management

- ⚠️ **KHÔNG commit API keys** vào repository
- ✅ Sử dụng `.env` files và `.gitignore`
- ✅ Sử dụng secrets management services (AWS Secrets Manager, HashiCorp Vault)

---

## 13. Tối Ưu Hóa & Performance

### 13.1 Database Optimization

- ✅ **Indexes** trên các fields thường được query (city, rating, google_place_id)
- ✅ **Geospatial index (2dsphere)** cho location-based queries
- ✅ **Pagination** cho các list endpoints
- 🔄 **Database caching** với Redis (đề xuất triển khai)

### 13.2 API Performance

- 🔄 **Response caching** cho data ít thay đổi (places)
- ✅ **Lazy loading** cho danh sách POIs
- 🔄 **CDN** cho images (photos từ Google Places)
- ✅ **Async/await** pattern cho I/O operations

### 13.3 Frontend Performance

- ✅ **React Native performance** với FlatList cho danh sách dài
- ✅ **Image optimization** với expo-image
- 🔄 **Offline support** với AsyncStorage
- 🔄 **State management** với React Context hoặc Redux

### 13.4 AI Optimizer Performance

- ✅ **Pre-filtering** POIs trước khi tính ECS (lọc theo opening hours)
- ✅ **Batch processing** cho Distance Matrix API requests
- ✅ **Heuristic algorithms** (Nearest Neighbor) thay vì exact algorithms để giảm complexity
- 🔄 **Caching ETA matrix** giữa các POIs

**Legend:**
- ✅ Đã triển khai
- 🔄 Đề xuất triển khai
- ⚠️ Lưu ý quan trọng

---

## Kết Luận

Hệ thống Travel App là một ứng dụng du lịch thông minh với kiến trúc microservices hiện đại, tích hợp AI và machine learning để cung cấp trải nghiệm cá nhân hóa cho người dùng. 

**Điểm mạnh:**
- ✅ Kiến trúc microservices linh hoạt, dễ mở rộng
- ✅ Tích hợp AI/ML với PhoBERT cho phân tích cảm xúc tiếng Việt
- ✅ Thuật toán tối ưu lộ trình thông minh (ECS + Nearest Neighbor)
- ✅ Xác thực đa kênh (Email, Google OAuth)
- ✅ Mobile-first với React Native và Expo

**Đề xuất cải thiện:**
- 🔄 Triển khai caching layer (Redis) cho performance
- 🔄 Thêm offline support cho mobile app
- 🔄 Triển khai testing (unit tests, e2e tests)
- 🔄 Thêm monitoring và logging (Sentry, LogRocket)
- 🔄 Implement CI/CD pipeline
- 🔄 Thêm admin dashboard
- 🔄 Hỗ trợ đa ngôn ngữ (i18n)

**Liên hệ & Đóng góp:**
- Repository: `Tooltu-deve/Travel-App`
- Issues: Báo lỗi hoặc đề xuất tính năng mới
- Pull Requests: Đóng góp code theo coding convention

---

**Document Version:** 1.0.0  
**Last Updated:** 18/11/2025  
**Maintained by:** Development Team
