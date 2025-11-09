📁 CẤU TRÚC ĐỰ ÁN MỚI
========================

Dự án đã được tái cấu trúc từ Monolithic Structure (tất cả trong src/) thành Modular Structure (phân tách theo domain).

## 📊 BIỂU ĐỒ CẤU TRÚC MỚI

```
Travel-App-/
├── app/                              # 🎯 ROUTING & SCREENS
│   ├── (auth)/                       # Auth Stack (Login/Register)
│   │   ├── _layout.tsx              # Auth Layout - Quản lý Auth Stack
│   │   ├── login/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── index.tsx            # Export LoginScreen
│   │   │   └── ...
│   │   └── register/
│   │       ├── RegisterScreen.tsx
│   │       ├── index.tsx            # Export RegisterScreen
│   │       └── ...
│   ├── (main)/                       # Main App Stack (Home/Profile/...)
│   │   ├── _layout.tsx              # Main Layout - Quản lý Main Stack
│   │   ├── home/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── index.tsx            # Export HomeScreen
│   │   │   ├── components/          # Screen-specific components
│   │   │   ├── mockData.ts
│   │   │   └── ...
│   │   ├── favorites/
│   │   │   ├── FavoritesScreen.tsx
│   │   │   ├── index.tsx
│   │   │   └── ...
│   │   ├── itinerary/
│   │   │   ├── ItineraryScreen.tsx
│   │   │   ├── index.tsx
│   │   │   └── ...
│   │   ├── notifications/
│   │   │   ├── NotificationScreen.tsx
│   │   │   ├── index.tsx
│   │   │   └── ...
│   │   └── profile/
│   │       ├── ProfileScreen.tsx
│   │       ├── index.tsx
│   │       └── ...
│   ├── _layout.tsx                  # 🎯 ROOT LAYOUT - Entry Point
│   ├── index.tsx                    # 🎯 ROOT INDEX
│   └── global.css                   # Global Styles
│
├── components/                       # 🧩 REUSABLE COMPONENTS
│   ├── common/                       # Common/Shared components
│   │   └── ...
│   └── navigation/                   # Navigation components
│       ├── RootNavigator.tsx         # Main conditional navigator
│       ├── AuthNavigator.tsx         # Auth stack navigator
│       ├── BottomTabNavigator.tsx    # Bottom tabs navigator
│       └── index.ts
│
├── constants/                        # ⚙️ CONSTANTS
│   ├── colors.ts
│   ├── spacing.ts
│   └── index.ts
│
├── contexts/                         # 🔄 REACT CONTEXT
│   └── AuthContext.tsx              # Authentication state management
│
├── services/                         # 🌐 API SERVICES
│   └── api.ts                       # Backend API calls
│
├── hooks/                            # 🪝 CUSTOM HOOKS
│   └── (empty for now)
│
├── types/                            # 📝 TYPESCRIPT TYPES
│   └── (empty for now)
│
├── utils/                            # 🛠️ UTILITY FUNCTIONS
│   └── (empty for now)
│
├── assets/                           # 📷 MEDIA FILES
│   ├── images/
│   │   └── test_address/
│   ├── icons/
│   └── sounds/
│
├── tsconfig.json                     # ⚙️ TypeScript Config (Updated)
├── package.json
├── app.json
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── eslint.config.js
└── README.md
```

---

## 🔄 SO SÁNH CỰ CẤU TRÚC

### ❌ CẦU TRÚC CŨ (Monolithic)
```
src/
├── screens/
│   ├── LoginScreen/
│   ├── RegisterScreen/
│   ├── HomeScreen/
│   └── ...
├── components/
│   ├── common/
│   └── navigation/
├── constants/
├── contexts/
├── services/
├── types/
├── hooks/
├── utils/
└── styles/

app/
├── _layout.tsx
├── index.tsx
└── global.css
```

### ✅ CẤU TRÚC MỚI (Modular/Domain-based)
```
app/
├── (auth)/
│   ├── _layout.tsx
│   ├── login/
│   │   ├── LoginScreen.tsx
│   │   └── index.tsx
│   └── register/
│       ├── RegisterScreen.tsx
│       └── index.tsx
├── (main)/
│   ├── _layout.tsx
│   ├── home/
│   ├── favorites/
│   ├── itinerary/
│   ├── notifications/
│   └── profile/
├── _layout.tsx (ROOT)
└── index.tsx (ROOT)

components/  ← Common components
constants/   ← Shared constants
contexts/    ← Global state
services/    ← API calls
hooks/       ← Custom hooks
types/       ← TypeScript types
utils/       ← Utility functions
```

---

## 🎯 LỢI ÍCH CỦA CẤU TRÚC MỚI

✅ **Routing dễ dàng hơn**
- Expo Router tự động tạo routes từ folder structure
- Không cần cấu hình route thủ công

✅ **Code Organization tốt hơn**
- Grouped screens (auth vs main) rõ ràng
- Screen-specific components lưu gần screen

✅ **Scalability cao hơn**
- Dễ thêm tính năng mới (tạo folder mới)
- Dễ xóa hoặc refactor (xóa folder)

✅ **File structure hiển thị rõ intent**
- (auth) = Auth flow
- (main) = Main app flow
- Dấu ngoặc () chỉ những group routes

✅ **Reusable components tập trung**
- components/ folder chứa toàn bộ shared components
- Dễ tìm và tái sử dụng

---

## 📂 CÁCH THÊM MÀN HÌNH MỚI

### 1️⃣ Màn hình trong Auth Stack
```bash
# Tạo folder mới
mkdir -p app/(auth)/forgot-password

# Tạo screen file
app/(auth)/forgot-password/ForgotPasswordScreen.tsx

# Tạo index.tsx
app/(auth)/forgot-password/index.tsx
export { default } from './ForgotPasswordScreen';
```

### 2️⃣ Màn hình trong Main Stack
```bash
# Tạo folder mới
mkdir -p app/(main)/search

# Tạo screen file
app/(main)/search/SearchScreen.tsx

# Tạo index.tsx
app/(main)/search/index.tsx
export { default } from './SearchScreen';
```

### 3️⃣ Cập nhật Navigation (nếu cần)
- AuthNavigator.tsx (cho auth screens)
- BottomTabNavigator.tsx (cho main screens)

---

## 🔗 NAVIGATION FLOW

```
RootNavigator (app/_layout.tsx)
│
├─ isAuthenticated = false
│  └─ AuthNavigator
│     ├─ LoginScreen (app/(auth)/login/)
│     └─ RegisterScreen (app/(auth)/register/)
│
└─ isAuthenticated = true
   └─ BottomTabNavigator
      ├─ HomeScreen (app/(main)/home/)
      ├─ FavoritesScreen (app/(main)/favorites/)
      ├─ ItineraryScreen (app/(main)/itinerary/)
      ├─ NotificationScreen (app/(main)/notifications/)
      └─ ProfileScreen (app/(main)/profile/)
```

---

## 🔧 TSCONFIG PATH UPDATE

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]  // ✅ Thay vì "./src/*"
    }
  }
}
```

**Cách sử dụng:**
```typescript
import { COLORS } from '@/constants';      // → constants/colors.ts
import { useAuth } from '@/contexts/auth'; // → contexts/AuthContext.tsx
import { loginAPI } from '@/services/api'; // → services/api.ts
```

---

## ✨ FILES ĐÃ ĐƯỢC TẠO/CẬP NHẬT

### Tạo mới:
- ✅ `app/(auth)/_layout.tsx` - Auth Stack layout
- ✅ `app/(main)/_layout.tsx` - Main Stack layout
- ✅ `app/(auth)/login/index.tsx` - Login export
- ✅ `app/(auth)/register/index.tsx` - Register export
- ✅ `app/(main)/home/index.tsx` - Home export
- ✅ `app/(main)/favorites/index.tsx` - Favorites export
- ✅ `app/(main)/itinerary/index.tsx` - Itinerary export
- ✅ `app/(main)/notifications/index.tsx` - Notifications export
- ✅ `app/(main)/profile/index.tsx` - Profile export

### Cập nhật:
- ✅ `tsconfig.json` - Path từ "./src/*" thành "./*"
- ✅ `components/navigation/AuthNavigator.tsx` - Imports updated
- ✅ `components/navigation/BottomTabNavigator.tsx` - Imports updated

### Di chuyển:
- ✅ `src/screens/*` → `app/(auth)/` & `app/(main)/`
- ✅ `src/components/` → `components/`
- ✅ `src/constants/` → `constants/`
- ✅ `src/contexts/` → `contexts/`
- ✅ `src/services/` → `services/`
- ✅ `src/types/` → `types/`
- ✅ `src/hooks/` → `hooks/`
- ✅ `src/utils/` → `utils/`

### Xóa:
- ✅ `src/` folder (đã xóa hoàn toàn)

---

## 🚀 BƯỚC TIẾP THEO

1. **Test app** - Chạy `npm start` để kiểm tra
2. **Kiểm tra imports** - Đảm bảo không có lỗi import
3. **Test navigation** - Kiểm tra auth flow hoạt động đúng
4. **Thêm screens mới** - Sử dụng cấu trúc mới cho features mới

---

## 📝 GHI CHÚ QUAN TRỌNG

⚠️ **Không được xóa các folder:**
- `app/(auth)/` - Auth screens phải ở đây
- `app/(main)/` - Main screens phải ở đây
- `components/` - Shared components phải ở đây

⚠️ **Khi thêm màn hình mới, nhớ:**
- Tạo folder với tên dạng kebab-case (vd: `forgot-password`)
- Tạo file Screen (vd: `ForgotPasswordScreen.tsx`)
- Tạo `index.tsx` export mặc định
- Cập nhật navigator (AuthNavigator hoặc BottomTabNavigator)

✅ **Kiểm tra:**
- Tất cả imports sử dụng `@/` paths
- Không có imports từ `src/` (src đã bị xóa)
- tsconfig.json path đã cập nhật

---

**Tạo bởi:** AI Assistant
**Ngày:** November 5, 2025
**Trạng thái:** ✅ Hoàn thành
