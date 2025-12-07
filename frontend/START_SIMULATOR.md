# Hướng dẫn chạy Frontend trên Giả lập

## 🎯 Chuẩn bị

### Kiểm tra Xcode đã cài đặt chưa:
```bash
xcode-select --version
# Nếu chưa có: xcode-select --install
```

### Kiểm tra iOS Simulator:
```bash
xcrun simctl list devices | grep iPhone
```

## 🚀 Cách 1: Chạy trên iOS Simulator (Mac)

### Bước 1: Mở iOS Simulator trước
```bash
open -a Simulator
```

### Bước 2: Chọn device trong Simulator
- Menu: **File > Open Simulator > iOS 18.1 > iPhone 16 Pro** (hoặc iPhone khác)
- Đợi simulator khởi động xong

### Bước 3: Chạy Expo
```bash
cd /Users/macos/Documents/project-comthink/frontend
npm run ios
```

Hoặc:
```bash
npx expo start --ios
```

### Bước 4: App sẽ tự động build và chạy trên simulator
- Lần đầu tiên sẽ mất 2-3 phút để build
- Lần sau sẽ nhanh hơn

## 🤖 Cách 2: Chạy trên Android Emulator

### Bước 1: Cài Android Studio (nếu chưa có)
Download từ: https://developer.android.com/studio

### Bước 2: Setup Android Emulator
1. Mở Android Studio
2. Menu: **Tools > Device Manager**
3. Click **Create Device**
4. Chọn: **Pixel 6** (hoặc device khác)
5. Chọn System Image: **Android 13 (API 33)**
6. Click **Finish**

### Bước 3: Khởi động Emulator
```bash
# Hoặc click nút ▶️ trong Android Studio Device Manager
~/Library/Android/sdk/emulator/emulator -avd Pixel_6_API_33
```

### Bước 4: Chạy Expo
```bash
cd /Users/macos/Documents/project-comthink/frontend
npm run android
```

## 📱 Cách 3: Scan QR Code (Dễ nhất)

### Bước 1: Chạy Expo Dev Server
```bash
cd /Users/macos/Documents/project-comthink/frontend
npx expo start
```

### Bước 2: Scan QR Code
- **iOS**: Mở Camera app > Scan QR code > Mở link
- **Android**: Mở Expo Go app > Scan QR code

### Bước 3: Cài Expo Go app (nếu chưa có)
- **iOS**: https://apps.apple.com/app/expo-go/id982107779
- **Android**: https://play.google.com/store/apps/details?id=host.exp.exponent

## 🔧 Troubleshooting

### Lỗi: "Could not connect to development server"
**Giải pháp**: Đảm bảo backend đang chạy
```bash
# Terminal 1: Backend
cd /Users/macos/Documents/project-comthink/backend
npm run start:dev

# Terminal 2: AI Agent
cd /Users/macos/Documents/project-comthink/travel-ai-agent
source venv/bin/activate
python main.py

# Terminal 3: Frontend
cd /Users/macos/Documents/project-comthink/frontend
npx expo start --ios
```

### Lỗi: "Network request failed"
**Giải pháp**: Kiểm tra `API_BASE_URL` trong `services/api.ts`

Cho **Simulator iOS**:
```typescript
const API_BASE_URL = 'http://localhost:3000';  // ✅ OK
```

Cho **Điện thoại thật**:
```typescript
const API_BASE_URL = 'http://192.168.1.255:3000';  // Thay IP của Mac
```

### Lỗi: "Unable to resolve module"
**Giải pháp**: Clear cache và reinstall
```bash
cd frontend
rm -rf node_modules
npm install
npx expo start --clear
```

### Lỗi: iOS build failed
**Giải pháp**: Install CocoaPods
```bash
sudo gem install cocoapods
cd ios && pod install && cd ..
npx expo start --ios
```

## 🎬 Quick Start (1 lệnh)

```bash
# Chạy tất cả services
cd /Users/macos/Documents/project-comthink && ./restart_all_services.sh
```

Sau đó:
```bash
# Mở simulator
open -a Simulator

# Đợi 10 giây rồi
cd frontend && npm run ios
```

## ✅ Kiểm tra hoạt động

1. App mở ra trang Login
2. Đăng ký tài khoản mới hoặc đăng nhập
3. Test tính năng:
   - ✅ Tìm kiếm địa điểm
   - ✅ Tạo lộ trình với AI Agent
   - ✅ Xem bản đồ
   - ✅ Chat với AI
   - ✅ GPS location (chỉ hoạt động trên điện thoại thật)

## 📸 Screenshot chức năng

Khi chạy thành công bạn sẽ thấy:
- **Trang chủ**: Danh sách địa điểm du lịch
- **Smart Agent**: Chat với AI để tạo lộ trình
- **Map**: Xem bản đồ với các điểm tham quan
- **Profile**: Quản lý tài khoản

Chúc bạn thành công! 🚀
