# Testing Guide - SmartGo Project

## 📋 Tổng quan các loại tests

### 1. **Unit Tests** - Kiểm tra từng function riêng lẻ (mocked dependencies)
- ✅ **Đã có**: `place.service.spec.ts`, `itinerary.service.spec.ts`
- Mock tất cả external APIs và database
- Chạy nhanh (~1s)

### 2. **Integration Tests** - Kiểm tra tích hợp giữa các thành phần
- ✅ **Đã có**: `test/integration/*.spec.ts`
- Dùng database thật nhưng có thể mock external APIs
- Chạy trung bình (~10-20s)

### 3. **E2E Tests** - Kiểm tra toàn bộ flow từ đầu đến cuối
- ✅ **Đã có**: `test/e2e/*.e2e-spec.ts`
- Dùng tất cả services thật (backend + AI optimizer + APIs)
- Chạy chậm (~30-60s)

---

## 🚀 Cách chạy tests

### Backend (NestJS)

```bash
cd backend

# 1. Unit Tests (nhanh nhất, không cần services ngoài)
npm test                    # Chạy tất cả unit tests
npm run test:watch         # Watch mode
npm run test:cov           # Với coverage report

# 2. Integration Tests (cần MongoDB)
npm run test:integration   # Cần: MongoDB + API keys thật

# 3. E2E Tests (cần tất cả services)
npm run test:e2e          # Cần: MongoDB + AI Optimizer + API keys

# 4. Chạy tất cả
npm run test:all          # Unit + Integration + E2E
```

### AI Optimizer Service (Python)

```bash
cd ai_optimizer_service

# Cài pytest nếu chưa có
pip install pytest pytest-cov

# Chạy tests
pytest test_main.py -v                    # Basic
pytest test_main.py -v --cov             # Với coverage
pytest test_main.py -v --cov-report=html # HTML report
```

---

## ⚙️ Setup cho Integration/E2E Tests

### 1. Tạo file .env.test

```bash
cd backend
cp .env.test.example .env.test
# Sau đó điền các API keys thật vào .env.test
```

### 2. Chuẩn bị MongoDB test database

```bash
# Option 1: Dùng MongoDB local
# Database 'smartgo-test' sẽ được tự động tạo

# Option 2: Dùng MongoDB Atlas (cloud)
# Cập nhật MONGODB_URI trong .env.test
```

### 3. Khởi động AI Optimizer Service (cho E2E tests)

```bash
cd ai_optimizer_service
python main.py
# Chạy ở port 8000
```

### 4. Chạy tests

```bash
cd backend
npm run test:integration  # Hoặc test:e2e
```

---

## 📊 Test Coverage

### Xem coverage report

```bash
cd backend

# Unit tests coverage
npm run test:cov
open coverage/lcov-report/index.html

# Integration tests coverage  
npm run test:integration
open coverage-integration/lcov-report/index.html

# E2E tests coverage
npm run test:e2e
open coverage-e2e/lcov-report/index.html
```

---

## 🎯 Test Strategy

### Khi nào dùng loại test nào?

| Loại Test | Khi nào dùng | Ưu điểm | Nhược điểm |
|-----------|--------------|---------|------------|
| **Unit** | Phát triển features mới, TDD | Nhanh, isolated, dễ debug | Không catch integration bugs |
| **Integration** | Sau khi unit tests pass | Catch integration issues | Chậm hơn unit tests |
| **E2E** | Trước khi deploy, regression testing | Kiểm tra toàn bộ system | Chậm nhất, khó debug |

### Workflow đề xuất

```bash
# 1. Phát triển feature mới
npm run test:watch          # Chạy unit tests liên tục

# 2. Sau khi hoàn thành feature
npm run test                # Chạy tất cả unit tests
npm run test:integration    # Kiểm tra tích hợp

# 3. Trước khi commit/merge
npm run test:all           # Chạy tất cả tests

# 4. Trước khi deploy production
npm run test:all           # Final check
npm run test:cov           # Kiểm tra coverage
```

---

## 🔧 Troubleshooting

### Integration tests thất bại?

```bash
# Kiểm tra MongoDB đang chạy
mongod --version
ps aux | grep mongod

# Kiểm tra .env.test có đúng không
cat .env.test

# Xóa test database và thử lại
mongo
> use smartgo-test
> db.dropDatabase()
```

### E2E tests thất bại?

```bash
# Kiểm tra AI Optimizer đang chạy
curl http://localhost:8000

# Kiểm tra API keys valid
# Test Google Places API manually
curl "https://places.googleapis.com/v1/places/ChIJ...?key=YOUR_KEY"
```

---

## 📝 Viết thêm tests mới

### Tạo unit test mới

```bash
cd backend/src/your-module
# Tạo file: your-service.spec.ts
# Theo pattern của place.service.spec.ts
```

### Tạo integration test mới

```bash
cd backend/test/integration
# Tạo file: your-module.integration.spec.ts
# Theo pattern của place.integration.spec.ts
```

### Tạo E2E test mới

```bash
cd backend/test/e2e
# Tạo file: your-feature.e2e-spec.ts
# Theo pattern của itinerary.e2e-spec.ts
```

---

## ✅ Test Checklist trước khi merge PR

- [ ] Tất cả unit tests pass
- [ ] Coverage > 80% cho code mới
- [ ] Integration tests pass
- [ ] E2E tests pass (ít nhất 1 happy path)
- [ ] Không có console.error trong test logs
- [ ] Test cả error cases, không chỉ happy paths

---

## 🎓 Best Practices

1. **AAA Pattern**: Arrange - Act - Assert
2. **Test names**: Describe what they test, not how
3. **Mock external services**: Trong unit tests
4. **One assertion per concept**: Dễ debug khi fail
5. **Clean up after tests**: Reset database, clear mocks
6. **Avoid flaky tests**: Không depend vào timing/random data
7. **Test error paths**: Không chỉ test happy paths

---

## 📚 Resources

- [Jest Documentation](https://jestjs.io/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Pytest Documentation](https://docs.pytest.org/)
- [Testing Best Practices](https://testingjavascript.com/)
