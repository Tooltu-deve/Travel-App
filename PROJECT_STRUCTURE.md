# 📁 Travel App - Project Structure Documentation

## 🎯 Tổng Quan Cấu Trúc

```
Travel-App-/
├── src/                           # 📦 Mã nguồn chính
│   ├── screens/                   # 📱 Các screen (trang)
│   │   ├── HomeScreen/            # Trang chủ - Dashboard
│   │   ├── ProfileScreen/         # Trang profile người dùng
│   │   ├── FavoritesScreen/       # Trang danh sách yêu thích
│   │   ├── ItineraryScreen/       # Trang lộ trình du lịch
│   │   └── NotificationScreen/    # Trang thông báo
│   │
│   ├── components/                # 🧩 Các component tái sử dụng
│   │   ├── navigation/            # Components liên quan navigation
│   │   │   └── BottomTabNavigator.tsx  # Bottom tab navigation
│   │   └── common/                # Các component dùng chung
│   │       ├── Header.tsx
│   │       ├── Card.tsx
│   │       └── Button.tsx
│   │
│   ├── constants/                 # 🔐 Constants (màu, khoảng cách, etc)
│   │   ├── colors.ts              # Định nghĩa tất cả màu sắc
│   │   ├── spacing.ts             # Định nghĩa spacing & border radius
│   │   └── index.ts               # Export tất cả constants
│   │
│   ├── types/                     # 🏷️ TypeScript type definitions
│   │   └── index.ts               # Tất cả interfaces & types
│   │
│   ├── utils/                     # 🛠️ Utility functions
│   │   ├── dateFormatter.ts       # Format date
│   │   ├── priceFormatter.ts      # Format giá tiền
│   │   └── validators.ts          # Validation functions
│   │
│   ├── hooks/                     # 🎣 Custom React Hooks
│   │   ├── useNavigation.ts       # Hook quản lý navigation
│   │   └── useFavorites.ts        # Hook quản lý danh sách yêu thích
│   │
│   ├── services/                  # 🌐 API services & external services
│   │   ├── api.ts                 # Base API configuration
│   │   ├── hotelService.ts        # Service cho hotel data
│   │   └── userService.ts         # Service cho user data
│   │
│   └── styles/                    # 🎨 Global styles (nếu cần)
│       └── globalStyles.ts        # Các style dùng chung
│
├── assets/                        # 📸 Media files
│   ├── images/                    # Hình ảnh
│   │   ├── hotel1.jpg
│   │   ├── destination1.jpg
│   │   └── ...
│   ├── icons/                     # Icon SVG/PNG
│   │   ├── home.svg
│   │   ├── heart.svg
│   │   └── ...
│   └── sounds/                    # Audio files
│       ├── notification.mp3
│       └── ...
│
├── app/                           # 📱 Expo Router app entry
│   ├── _layout.tsx                # Root layout
│   ├── index.tsx                  # Home page (if using Expo Router)
│   └── global.css                 # Global CSS
│
├── node_modules/                  # 📦 Dependencies (git ignored)
├── package.json                   # Project dependencies
├── tsconfig.json                  # TypeScript config
├── app.json                       # Expo config
└── coding_convention.md           # Quy ước code của team
```

---

## 📱 Screens (Các trang)

Mỗi screen có cấu trúc như sau:

```
screens/
  HomeScreen/
    ├── HomeScreen.tsx             # Component chính
    ├── HomeScreen.types.ts        # Type definitions của screen này
    ├── HomeScreen.styles.ts       # Styles (tuỳ chọn, nếu cần)
    ├── components/                # Sub-components của screen
    │   ├── FeaturedCard.tsx
    │   └── CategoryGrid.tsx
    └── index.ts                   # Export component
```

**Các screens hiện tại:**
- **HomeScreen** (Trang chủ): Dashboard chính hiển thị hotels, categories, promotions
- **ProfileScreen** (Tôi): Thông tin người dùng, settings
- **FavoritesScreen** (Yêu thích): Danh sách các khách sạn/tour yêu thích
- **ItineraryScreen** (Lộ trình): Quản lý lộ trình du lịch
- **NotificationScreen** (Thông báo): Danh sách thông báo

---

## 🧩 Components (Các component tái sử dụng)

### Cấu trúc component chuẩn

```
components/
  hotelCard/
    ├── HotelCard.tsx              # Component logic
    ├── HotelCard.types.ts         # Props types
    ├── HotelCard.styles.ts        # Stylesheet
    └── index.ts                   # Export
```

### Naming Convention
- **Component files**: `PascalCase` (ví dụ: `HotelCard.tsx`)
- **Folder names**: `camelCase` (ví dụ: `hotelCard/`)
- **Style files**: `ComponentName.styles.ts`
- **Type files**: `ComponentName.types.ts`

---

## 🔐 Constants

**`constants/colors.ts`**
```typescript
export const COLORS = {
  primary: '#00A3FF',      // Xanh Dương
  accent: '#FFC72C',       // Vàng Nắng
  success: '#4CAF50',      // Xanh Lá
  error: '#F44336',        // Đỏ
  // ... các màu khác
}
```

**`constants/spacing.ts`**
```typescript
export const SPACING = {
  xs: 4,   // Cực nhỏ
  sm: 8,   // Nhỏ
  md: 12,  // Trung bình
  lg: 16,  // Lớn
  xl: 20,  // Rất lớn
  // ... các kích thước khác
}
```

---

## 🏷️ Types (Type Definitions)

**`types/index.ts`** chứa tất cả interfaces:
- `Hotel`: Thông tin khách sạn
- `User`: Thông tin người dùng
- `Itinerary`: Lộ trình du lịch
- `Notification`: Thông báo
- `RootTabParamList`: Types cho tab navigation

---

## 🛠️ Utils (Utility Functions)

Các hàm tiện ích dùng chung:
```typescript
// dateFormatter.ts
export const formatDate = (date: Date) => {...}

// priceFormatter.ts
export const formatPrice = (price: number) => {...}

// validators.ts
export const validateEmail = (email: string) => {...}
```

---

## 🎣 Hooks (Custom React Hooks)

Các hook tái sử dụng:
```typescript
// useNavigation.ts
export const useNavigation = () => {...}

// useFavorites.ts
export const useFavorites = () => {...}
```

---

## 🌐 Services (API & External Services)

```typescript
// api.ts
export const apiClient = axios.create({...})

// hotelService.ts
export const getHotels = async () => {...}
export const getHotelById = async (id: string) => {...}

// userService.ts
export const getUser = async () => {...}
export const updateUser = async (user: User) => {...}
```

---

## 📸 Assets (Media Files)

### Images (`assets/images/`)
```
assets/images/
  ├── hotel1.jpg          # Hình ảnh khách sạn
  ├── destination1.jpg    # Hình ảnh điểm đến
  ├── splash.png          # Splash screen
  └── icon.png            # App icon
```

**Import:**
```typescript
import { Image } from 'react-native';

<Image 
  source={require('@/../assets/images/hotel1.jpg')} 
  style={{ width: 200, height: 150 }} 
/>
```

### Icons (`assets/icons/`)
```
assets/icons/
  ├── home.svg
  ├── heart.svg
  ├── map.svg
  ├── user.svg
  └── bell.svg
```

**Note:** Sử dụng `@expo/vector-icons` nên icons SVG tuỳ chọn

### Sounds (`assets/sounds/`)
```
assets/sounds/
  ├── notification.mp3    # Âm thanh thông báo
  ├── success.mp3         # Âm thanh thành công
  └── error.mp3           # Âm thanh lỗi
```

---

## 📚 Best Practices

### 1. **Import Paths**
```typescript
// ✅ ĐÚNG: Dùng alias
import { COLORS } from '@/constants';
import HomeScreen from '@/screens/HomeScreen/HomeScreen';

// ❌ SAI: Relative paths quá dài
import { COLORS } from '../../constants/colors';
import HomeScreen from '../../screens/HomeScreen/HomeScreen';
```

### 2. **Component Organization**
```typescript
// ✅ ĐÚNG: Tách styles & types
// HotelCard.tsx
import { styles } from './HotelCard.styles';
import { HotelCardProps } from './HotelCard.types';

// ❌ SAI: Styles & types inline
const HotelCard = ({ hotel }) => {
  const styles = StyleSheet.create({...});
  return ...;
}
```

### 3. **Constants Usage**
```typescript
// ✅ ĐÚNG
padding: SPACING.lg,
color: COLORS.primary,
borderRadius: BORDER_RADIUS.md,

// ❌ SAI
padding: 16,
color: '#00A3FF',
borderRadius: 8,
```

### 4. **Type Safety**
```typescript
// ✅ ĐÚNG: Define types
interface UserCardProps {
  user: User;
  onPress: (userId: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onPress }) => {...}

// ❌ SAI: Không có types
const UserCard = ({ user, onPress }) => {...}
```

---

## 📝 Workflow Mẫu

### Tạo một tính năng mới

1. **Tạo type** (nếu cần)
   ```
   src/types/index.ts → thêm interface
   ```

2. **Tạo service** (nếu liên quan API)
   ```
   src/services/newFeatureService.ts
   ```

3. **Tạo components** (component tái sử dụng)
   ```
   src/components/common/NewFeature.tsx
   src/components/common/NewFeature.types.ts
   src/components/common/NewFeature.styles.ts
   ```

4. **Tạo hook** (nếu cần logic phức tạp)
   ```
   src/hooks/useNewFeature.ts
   ```

5. **Integrate vào screen**
   ```
   src/screens/SomeScreen/SomeScreen.tsx
   ```

6. **Commit & Push**
   ```
   git add .
   git commit -m "feat(feature-name): add new feature"
   git push origin feature/feature-name
   ```

---

## 📊 Quy Ước File Naming

| Loại | Convention | Ví Dụ |
|------|-----------|-------|
| Screens | `PascalCase` + `Screen` | `HomeScreen.tsx` |
| Components | `PascalCase` | `HotelCard.tsx` |
| Folder | `camelCase` hoặc `PascalCase` | `hotelCard/` |
| Utils | `camelCase` | `dateFormatter.ts` |
| Services | `camelCase` + `Service` | `hotelService.ts` |
| Hooks | `camelCase` + `use` prefix | `useFavorites.ts` |
| Types | `PascalCase` + `.types.ts` | `HotelCard.types.ts` |
| Styles | `ComponentName.styles.ts` | `HotelCard.styles.ts` |

---

## 🔗 Navigation Structure

```
RootLayout (_layout.tsx)
  └── BottomTabNavigator
      ├── HomeScreen (Trang chủ)
      ├── FavoritesScreen (Yêu thích)
      ├── ItineraryScreen (Lộ trình)
      ├── NotificationScreen (Thông báo)
      └── ProfileScreen (Tôi)
```

---

## 💡 Tips

1. **Giữ components nhỏ & tái sử dụng**
2. **Luôn define types cho props**
3. **Tách styles ra file riêng** (dễ maintain)
4. **Sử dụng constants thay vì hardcode**
5. **Một folder = một screen / component**
6. **Đặt tên rõ ràng & mô tả**

---

## 📞 Cần Trợ Giúp?

Khi làm việc trên project:
1. Tham khảo `coding_convention.md` về quy ước code
2. Follow cấu trúc folder này
3. Import dùng alias `@/`
4. Define types cho components
5. Commit message theo convention: `type(scope): description`

Happy Coding! 🚀
