# 📚 Travel App - Documentation Index

> Danh sách đầy đủ các tài liệu hệ thống Travel App

**Last Updated:** 18/11/2025  
**Version:** 1.0.0

---

## 📖 Tài Liệu Chính

### 1. [README.md](../README.md)
**Tài liệu khởi đầu cho dự án**

- Giới thiệu tổng quan về Travel App
- Tính năng chính
- Hướng dẫn cài đặt nhanh
- Quick start guide
- Contributing guidelines

**Đối tượng:** Tất cả mọi người (developers, users, contributors)

---

### 2. [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md)
**Tổng quan toàn diện về hệ thống** ⭐ **BẮT ĐẦU TẠI ĐÂY**

**Nội dung:**
- Kiến trúc hệ thống microservices
- Chi tiết từng service:
  - Backend (NestJS)
  - Frontend (React Native/Expo)
  - AI Optimizer (FastAPI)
  - Data Processing (PhoBERT)
- Cơ sở dữ liệu MongoDB
- Luồng dữ liệu (Data flows)
- API endpoints overview
- Quy ước code
- Tối ưu hóa và performance

**Đối tượng:** Developers, System Architects, Technical Leads

**Thời gian đọc:** ~30 phút

---

### 3. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
**Tài liệu API chi tiết**

**Nội dung:**
- Authentication APIs (Register, Login, OAuth)
- User/Profile APIs
- Place APIs (Search, CRUD)
- Itinerary APIs (Create, Optimize)
- AI Optimizer APIs
- Error responses và error handling
- Rate limiting
- Request/Response examples với cURL

**Đối tượng:** Backend Developers, Frontend Developers, API Consumers

**Thời gian đọc:** ~45 phút

---

### 4. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
**Hướng dẫn triển khai production**

**Nội dung:**
- Prerequisites và system requirements
- Local development setup
- Production deployment strategies:
  - Heroku
  - AWS (EC2, ECS, Lambda)
  - Google Cloud Platform (Cloud Run)
- Docker & Docker Compose
- Environment variables
- Database setup (MongoDB Atlas)
- CI/CD với GitHub Actions
- Monitoring & Logging (Sentry, New Relic)
- Troubleshooting

**Đối tượng:** DevOps Engineers, Backend Developers

**Thời gian đọc:** ~60 phút

---

## 🎨 Sơ Đồ & Diagrams

### 5. [system_architecture_diagram.md](./system_architecture_diagram.md)
**Sơ đồ kiến trúc tổng quan**

- Mermaid diagram của kiến trúc microservices
- Luồng dữ liệu giữa các services
- Tích hợp với external APIs

**Đối tượng:** Developers, System Architects

---

### 6. [class_diagram.md](./class_diagram.md)
**Class diagram cho Backend**

- Auth Module structure
- User Module structure
- Relationships giữa các modules

**Đối tượng:** Backend Developers

---

### 7. [sequence_diagram.md](./sequence_diagram.md)
**Sequence diagrams cho các flows chính**

- Authentication flow
- Itinerary creation flow
- (Nếu có thêm)

**Đối tượng:** Developers

---

### 8. [data_flowchart.md](./data_flowchart.md)
**Data flow diagrams**

- Luồng dữ liệu trong hệ thống
- Data transformations

**Đối tượng:** Developers, Data Engineers

---

### 9. [user_flowchart.md](./user_flowchart.md)
**User flow diagrams**

- User journey trong app
- Screen flows

**Đối tượng:** UI/UX Designers, Frontend Developers

---

## 📝 Coding Standards

### 10. [coding_convention.md](./coding_convention.md)
**Quy ước code và Git workflow**

**Nội dung:**
- Naming conventions (Components, Files, Variables)
- Git workflow (Branch strategy)
- Commit convention (Conventional Commits)
- Code style guidelines
- File organization
- Code review checklist

**Đối tượng:** All Developers

**Bắt buộc đọc:** ✅ Trước khi contribute code

---

## 🗺️ Roadmap Đọc Tài Liệu

### Cho Developers Mới

**Bước 1:** [README.md](../README.md) - Hiểu tổng quan dự án (10 phút)

**Bước 2:** [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Nắm kiến trúc và tech stack (30 phút)

**Bước 3:** [coding_convention.md](./coding_convention.md) - Học quy ước code (15 phút)

**Bước 4:** [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Làm quen với APIs (45 phút)

**Bước 5:** Setup local environment theo hướng dẫn trong README.md (30 phút)

**Tổng thời gian:** ~2.5 giờ

---

### Cho Backend Developers

1. [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 3 (Backend)
2. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Tất cả endpoints
3. [class_diagram.md](./class_diagram.md) - Hiểu module structure
4. [coding_convention.md](./coding_convention.md) - TypeScript style guide

---

### Cho Frontend Developers

1. [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 4 (Frontend)
2. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API consumption
3. [user_flowchart.md](./user_flowchart.md) - User flows
4. [coding_convention.md](./coding_convention.md) - React Native style guide

---

### Cho DevOps/Infrastructure

1. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Toàn bộ
2. [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 2 (Kiến trúc)
3. [system_architecture_diagram.md](./system_architecture_diagram.md)

---

### Cho AI/ML Engineers

1. [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 5 & 6
2. [data_flowchart.md](./data_flowchart.md)
3. Source code: `ai_optimizer_servive/main.py`
4. Source code: `data_processing/`

---

## 🔍 Tìm Kiếm Nhanh

### Tôi muốn biết...

**"Làm thế nào để setup local development?"**
→ [README.md](../README.md) - Section "Cài Đặt"

**"API endpoints có gì?"**
→ [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

**"ECS algorithm hoạt động như thế nào?"**
→ [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 5.3

**"Làm thế nào deploy lên production?"**
→ [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

**"Quy ước commit message?"**
→ [coding_convention.md](./coding_convention.md) - Section "Commit Convention"

**"Kiến trúc hệ thống ra sao?"**
→ [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 2

**"Database schema như thế nào?"**
→ [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 7

**"Có mood nào cho itinerary?"**
→ [SYSTEM_REVIEW.md](./SYSTEM_REVIEW.md) - Section 5.3 (Mood Weights)

---

## 📊 Thống Kê Tài Liệu

| Tài liệu | Số dòng | Số từ | Kích thước |
|----------|---------|-------|------------|
| README.md | ~350 | ~2,500 | ~11 KB |
| SYSTEM_REVIEW.md | ~900 | ~7,000 | ~30 KB |
| API_DOCUMENTATION.md | ~700 | ~5,000 | ~22 KB |
| DEPLOYMENT_GUIDE.md | ~650 | ~4,500 | ~21 KB |
| coding_convention.md | ~250 | ~1,500 | ~7 KB |
| **TỔNG** | **~2,850** | **~20,500** | **~91 KB** |

---

## 🎯 Mục Tiêu Tài Liệu

### Đã Hoàn Thành ✅

- [x] System overview và architecture
- [x] API documentation đầy đủ
- [x] Deployment guide chi tiết
- [x] Coding conventions
- [x] Quick start guide
- [x] Database schema documentation

### Sắp Tới 🔄

- [ ] Video tutorials (YouTube)
- [ ] Interactive API documentation (Swagger/Postman)
- [ ] Troubleshooting guide
- [ ] Performance tuning guide
- [ ] Security best practices guide
- [ ] Testing documentation
- [ ] Contributing guide mở rộng
- [ ] FAQ section

---

## 💡 Đóng Góp

Nếu bạn thấy tài liệu thiếu hoặc chưa rõ ràng:

1. Tạo issue tại: https://github.com/Tooltu-deve/Travel-App/issues
2. Gắn label: `documentation`
3. Mô tả phần cần cải thiện

Hoặc:

1. Fork repository
2. Cập nhật tài liệu
3. Tạo Pull Request

---

## 📧 Liên Hệ

- **GitHub Issues:** https://github.com/Tooltu-deve/Travel-App/issues
- **Project Repository:** https://github.com/Tooltu-deve/Travel-App

---

## 📜 License

Tất cả tài liệu trong thư mục này tuân theo MIT License của dự án.

---

**Happy Reading! 📚✨**

*Tài liệu được duy trì bởi Development Team*
