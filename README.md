# 🌍 Travel App - Ứng Dụng Du Lịch Thông Minh

> Ứng dụng du lịch thông minh sử dụng AI để tối ưu hóa lộ trình dựa trên cảm xúc người dùng (Emotional Compatibility Score - ECS)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.x-brightgreen)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-blue)](https://reactnative.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-10.x-red)](https://nestjs.com/)

---

## 📋 Mục Lục

- [Giới Thiệu](#-giới-thiệu)
- [Tính Năng](#-tính-năng)
- [Kiến Trúc](#-kiến-trúc)
- [Công Nghệ](#-công-nghệ)
- [Cài Đặt](#-cài-đặt)
- [Sử Dụng](#-sử-dụng)
- [Tài Liệu](#-tài-liệu)
- [Đóng Góp](#-đóng-góp)
- [License](#-license)

---

## 🎯 Giới Thiệu

**Travel App** là một ứng dụng du lịch thông minh được xây dựng trên kiến trúc microservices, tích hợp AI và Machine Learning để cung cấp trải nghiệm du lịch được cá nhân hóa cho người dùng.

### Điểm Nổi Bật

🤖 **AI-Powered Route Optimization**: Sử dụng thuật toán ECS (Emotional Compatibility Score) để tối ưu lộ trình dựa trên cảm xúc và sở thích người dùng

🗺️ **Smart POI Recommendation**: Gợi ý địa điểm du lịch thông minh dựa trên:
- Mood/cảm xúc người dùng
- Ngân sách
- Thời gian
- Vị trí địa lý

🧠 **PhoBERT Integration**: Phân tích cảm xúc từ đánh giá tiếng Việt bằng mô hình PhoBERT

📱 **Cross-Platform Mobile App**: Ứng dụng di động chạy trên iOS và Android với React Native/Expo

🔐 **Secure Authentication**: Đa kênh xác thực (Email/Password, Google OAuth)

---

## ✨ Tính Năng

### 🔍 Tìm Kiếm & Khám Phá
- Tìm kiếm địa điểm du lịch (POI) với bộ lọc nâng cao
- Lọc theo thành phố, loại địa điểm, ngân sách, bán kính
- Xem chi tiết POI với ảnh, đánh giá, giờ mở cửa

### 🗓️ Lập Kế Hoạch Hành Trình
- Tạo lộ trình tự động theo số ngày và mood
- Tối ưu thứ tự thăm quan dựa trên:
  - ECS Score (Emotional Compatibility)
  - Thời gian di chuyển (Google Distance Matrix API)
  - Giờ mở cửa của POIs
- Xem lịch trình chi tiết với thời gian đến/rời dự kiến

### 👤 Quản Lý Người Dùng
- Đăng ký/đăng nhập với Email hoặc Google
- Quản lý profile cá nhân
- Lưu và quản lý lộ trình yêu thích

### 🎭 Mood-Based Recommendations
Hệ thống hỗ trợ 11 moods khác nhau:
1. Yên tĩnh & Thư giãn
2. Náo nhiệt & Xã hội
3. Lãng mạn & Riêng tư
4. Đắt đỏ & Sang trọng
5. Đáng tiền & Giá rẻ
6. Điểm thu hút khách du lịch
7. Mạo hiểm & Thú vị
8. Gia đình & Thoải mái
9. Hiện đại & Sáng tạo
10. Tâm linh & Tôn giáo
11. Địa phương & Đích thực

---

## 🏗️ Kiến Trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                 │
│  📱 Expo App (React Native 19.x + NativeWind)                   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API GATEWAY LAYER                              │
│  🔧 NestJS Backend (TypeScript)                                 │
│     - Authentication & Authorization                             │
│     - Business Logic & Orchestration                            │
└───────┬──────────────────┬──────────────────┬───────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   MongoDB    │  │ AI Optimizer │  │  Google Maps APIs    │
│   Database   │  │   (FastAPI)  │  │  - Distance Matrix   │
│  - Users     │  │  - ECS Score │  │  - Place Details     │
│  - POIs      │  │  - Route Opt │  │  - Geocoding         │
└──────────────┘  └──────┬───────┘  └──────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │     Data     │
                  │  Processing  │
                  │  - PhoBERT   │
                  │  - Scraping  │
                  └──────────────┘
```

---

## 🛠️ Công Nghệ

### Backend
- **Framework**: NestJS 10.x (TypeScript)
- **Database**: MongoDB 8.x với Mongoose
- **Authentication**: Passport (Local, JWT, Google OAuth)
- **Validation**: class-validator, class-transformer

### Frontend
- **Framework**: React Native 0.81.5 với Expo 54.x
- **UI**: NativeWind (TailwindCSS for React Native)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API

### AI & Data Processing
- **Framework**: FastAPI (Python)
- **ML Model**: PhoBERT (vinai/phobert-base)
- **Libraries**: PyTorch, Transformers, Pandas
- **Scraping**: Playwright

### External Services
- **Maps**: Google Maps Platform
  - Distance Matrix API
  - Places API
  - Geocoding API
- **Database**: MongoDB Atlas (Cloud)

---

## 🚀 Cài Đặt

### Prerequisites

```bash
# Node.js >= 18.x
node --version

# Python >= 3.10
python3 --version

# MongoDB >= 6.x (local) hoặc MongoDB Atlas
mongosh --version

# Git
git --version
```

### 1. Clone Repository

```bash
git clone https://github.com/Tooltu-deve/Travel-App.git
cd Travel-App
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env với các thông tin cấu hình của bạn

# Start development server
npm run start:dev
```

**Backend chạy tại:** http://localhost:3000

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
echo "API_BASE_URL=http://localhost:3000" > .env

# Start Expo
npm start
```

### 4. AI Optimizer Setup

```bash
cd ai_optimizer_servive

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo "GOOGLE_DISTANCE_MATRIX_API_KEY=your-api-key" > .env

# Start server
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

**AI Optimizer chạy tại:** http://localhost:5000

### 5. Data Processing Setup (Optional)

```bash
cd data_processing

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

---

## 📖 Sử Dụng

### Development Mode

**Chạy tất cả services:**

```bash
# Terminal 1: Backend
cd backend && npm run start:dev

# Terminal 2: AI Optimizer
cd ai_optimizer_servive && source venv/bin/activate && uvicorn main:app --reload

# Terminal 3: Frontend
cd frontend && npm start
```

### Docker Compose (Khuyến nghị)

```bash
# Tạo file .env với các biến môi trường
cp .env.example .env

# Build và start tất cả services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Seed Database

```bash
cd backend
npm run seed
```

---

## 📚 Tài Liệu

Tài liệu chi tiết được lưu trong thư mục [`docs/`](./docs/):

| Tài Liệu | Mô Tả |
|----------|-------|
| [SYSTEM_REVIEW.md](./docs/SYSTEM_REVIEW.md) | Tổng quan toàn diện về hệ thống |
| [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) | Chi tiết về API endpoints |
| [DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) | Hướng dẫn triển khai |
| [coding_convention.md](./docs/coding_convention.md) | Quy ước code và Git workflow |
| [system_architecture_diagram.md](./docs/system_architecture_diagram.md) | Sơ đồ kiến trúc hệ thống |
| [class_diagram.md](./docs/class_diagram.md) | Class diagram |

### API Endpoints

**Authentication:**
- `POST /auth/register` - Đăng ký
- `POST /auth/login` - Đăng nhập
- `GET /auth/google` - Google OAuth

**Places:**
- `GET /places` - Lấy danh sách POIs
- `GET /places/search` - Tìm kiếm với filters
- `GET /places/:id` - Chi tiết POI

**Itinerary:**
- `POST /itinerary/create` - Tạo lộ trình
- `GET /itinerary/:id` - Chi tiết lộ trình
- `GET /itinerary/user/:userId` - Lộ trình của user

**Profile:**
- `GET /profile` - Xem profile
- `PATCH /profile` - Cập nhật profile
- `POST /profile/change-password` - Đổi mật khẩu

---

## 🎨 Screenshots

### Mobile App

*(Screenshots sẽ được thêm sau)*

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Frontend Tests

```bash
cd frontend

# Run tests (nếu có cấu hình)
npm test
```

---

## 🔧 Development

### Code Style

Dự án sử dụng:
- **ESLint** cho linting (TypeScript)
- **Prettier** cho formatting
- **Conventional Commits** cho commit messages

### Commit Convention

```
<type>(<scope>): <description>

feat(auth): add Google OAuth login
fix(itinerary): resolve ECS calculation bug
docs: update API documentation
```

### Branch Strategy

```
main (production)
├── develop (staging)
    ├── feature/user-authentication
    ├── feature/itinerary-optimization
    └── hotfix/critical-bug
```

---

## 🤝 Đóng Góp

Chúng tôi hoan nghênh mọi đóng góp! Vui lòng làm theo các bước sau:

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'feat: add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Coding Guidelines

- Tuân theo [Coding Convention](./docs/coding_convention.md)
- Viết tests cho code mới
- Cập nhật documentation nếu cần
- Ensure all tests pass

---

## 📝 TODO

- [ ] Implement unit tests
- [ ] Add E2E tests
- [ ] Implement refresh token mechanism
- [ ] Add Redis caching layer
- [ ] Implement rate limiting
- [ ] Add admin dashboard
- [ ] Internationalization (i18n)
- [ ] Offline support for mobile app
- [ ] Push notifications
- [ ] Social sharing features

---

## 🐛 Bug Reports

Nếu bạn tìm thấy bug, vui lòng tạo issue tại:
https://github.com/Tooltu-deve/Travel-App/issues

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

**Maintained by:** Development Team

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Backend framework
- [React Native](https://reactnative.dev/) - Mobile framework
- [Expo](https://expo.dev/) - React Native tooling
- [PhoBERT](https://github.com/VinAIResearch/PhoBERT) - Vietnamese BERT model
- [Google Maps Platform](https://developers.google.com/maps) - Maps and location services
- [MongoDB](https://www.mongodb.com/) - Database
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework

---

## 📞 Contact

- **Repository**: https://github.com/Tooltu-deve/Travel-App
- **Issues**: https://github.com/Tooltu-deve/Travel-App/issues

---

**Happy Traveling! 🌍✈️**
