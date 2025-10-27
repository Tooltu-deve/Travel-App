# 📊 Travel App - Architecture & Component Diagrams

## 1️⃣ Navigation Architecture

```
┌─────────────────────────────────────────┐
│         RootLayout (_layout.tsx)        │
│         Imports NavigationContainer     │
└────────────────┬────────────────────────┘
                 │
         ┌───────▼────────┐
         │ BottomTabNavi  │
         │   gator        │
         └───────┬────────┘
                 │
       ┌─────────┼─────────┬──────────┬─────────┐
       │         │         │          │         │
    ┌──▼──┐  ┌──▼──┐  ┌───▼──┐  ┌───▼──┐  ┌──▼──┐
    │Home │  │Fav  │  │Itin  │  │Notif │  │Prof │
    │(🏠) │  │(❤️) │  │(📍)  │  │(🔔)  │  │(👤) │
    └─────┘  └─────┘  └──────┘  └──────┘  └─────┘

TAB NAVIGATION
├─ Home (HomeScreen)           → Trang chủ - Dashboard
├─ Favorites (FavoritesScreen)  → Danh sách yêu thích
├─ Itinerary (ItineraryScreen)  → Lộ trình du lịch
├─ Notifications (NotifScreen)  → Thông báo
└─ Profile (ProfileScreen)      → Tôi
```

---

## 2️⃣ File Structure Tree

```
Travel-App-/
│
├─ 📂 src/
│  │
│  ├─ 📂 screens/                    # Tất cả screens
│  │  ├─ 📂 HomeScreen/              # Màn hình chủ
│  │  │  ├─ HomeScreen.tsx
│  │  │  ├─ HomeScreen.types.ts
│  │  │  ├─ HomeScreen.styles.ts
│  │  │  ├─ components/
│  │  │  │  ├─ FeaturedCard.tsx
│  │  │  │  └─ CategoryGrid.tsx
│  │  │  └─ index.ts
│  │  ├─ 📂 ProfileScreen/
│  │  ├─ 📂 FavoritesScreen/
│  │  ├─ 📂 ItineraryScreen/
│  │  └─ 📂 NotificationScreen/
│  │
│  ├─ 📂 components/                 # Components tái sử dụng
│  │  ├─ 📂 navigation/              # Navigation components
│  │  │  ├─ BottomTabNavigator.tsx
│  │  │  └─ index.ts
│  │  └─ 📂 common/                  # Shared components
│  │     ├─ Header.tsx
│  │     ├─ Card.tsx
│  │     └─ Button.tsx
│  │
│  ├─ 📂 constants/                  # Constants
│  │  ├─ colors.ts                   # Định nghĩa màu sắc
│  │  ├─ spacing.ts                  # Spacing & border radius
│  │  └─ index.ts                    # Export tất cả
│  │
│  ├─ 📂 types/                      # TypeScript definitions
│  │  └─ index.ts                    # Hotels, Users, Notifications, etc.
│  │
│  ├─ 📂 utils/                      # Utility functions
│  │  ├─ dateFormatter.ts
│  │  ├─ priceFormatter.ts
│  │  └─ validators.ts
│  │
│  ├─ 📂 hooks/                      # Custom React Hooks
│  │  ├─ useNavigation.ts
│  │  └─ useFavorites.ts
│  │
│  ├─ 📂 services/                   # API & External Services
│  │  ├─ api.ts                      # Base API config
│  │  ├─ hotelService.ts
│  │  └─ userService.ts
│  │
│  └─ 📂 styles/                     # Global styles (optional)
│     └─ globalStyles.ts
│
├─ 📂 assets/
│  ├─ 📂 images/                     # Hình ảnh
│  │  ├─ hotel1.jpg
│  │  ├─ destination1.jpg
│  │  └─ splash.png
│  ├─ 📂 icons/                      # Icons (optional, dùng @expo/vector-icons)
│  │  ├─ home.svg
│  │  └─ heart.svg
│  └─ 📂 sounds/                     # Audio files
│     ├─ notification.mp3
│     └─ success.mp3
│
├─ 📂 app/                           # Expo Router entry
│  ├─ _layout.tsx                    # Root layout (sử dụng BottomTabNavigator)
│  ├─ index.tsx                      # Home page (nếu dùng Expo Router)
│  └─ global.css                     # Global CSS (Tailwind)
│
├─ 📂 node_modules/                  # Dependencies (git ignored)
│
├─ 📄 package.json                   # Project metadata & dependencies
├─ 📄 tsconfig.json                  # TypeScript configuration
├─ 📄 app.json                       # Expo configuration
├─ 📄 tailwind.config.js             # Tailwind CSS config
├─ 📄 babel.config.js                # Babel configuration
├─ 📄 eslint.config.js               # ESLint configuration
├─ 📄 metro.config.js                # Metro bundler config
├─ 📄 .gitignore                     # Git ignored files
├─ 📄 coding_convention.md           # Team coding standards ⭐
├─ 📄 PROJECT_STRUCTURE.md           # Chi tiết cấu trúc project ⭐
└─ 📄 README.md                      # Project README ⭐
```

---

## 3️⃣ Component Hierarchy (HomeScreen)

```
┌────────────────────────────────────┐
│       HomeScreen Component         │
│    (Main Dashboard Container)      │
└─────────────────┬──────────────────┘
                  │
       ┌──────────┴──────────┬──────────────┬────────────┐
       │                     │              │            │
   ┌───▼───┐         ┌──────▼────┐   ┌────▼────┐  ┌───▼────┐
   │Header │         │SearchBar  │   │Featured │  │Tips    │
   │Section│         │Component  │   │Hotels   │  │Section │
   └───────┘         └───────────┘   │Carousel │  └────────┘
                                      └────┬────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                      ┌───▼────┐       ┌───▼────┐       ┌──▼───┐
                      │HotelCard│      │HotelCard│      │Hotel  │
                      │#1       │      │#2       │      │Card#3 │
                      └────────┘       └────────┘       └──────┘

Components Used:
├─ ScrollView (Main container)
├─ View (Header)
│  ├─ Text (Greeting)
│  └─ TouchableOpacity (Notification button)
├─ View (Search bar)
├─ SectionHeader
├─ ScrollView (Hotels horizontal)
│  └─ HotelCard × 3
├─ CategoryGrid
│  └─ CategoryCard × 4
├─ PromotionBanner
└─ TipCard
```

---

## 4️⃣ Data Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  API Services Layer                     │
│  (hotelService, userService, etc.)                      │
└────────────────────────┬────────────────────────────────┘
                         │
                   ┌─────▼────┐
                   │ API Call │
                   └─────┬────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    ┌───▼────┐      ┌────▼───┐     ┌────▼───┐
    │ Success│      │ Loading│     │ Error  │
    │ State  │      │ State  │     │ State  │
    └────┬───┘      └────────┘     └────────┘
         │
    ┌────▼──────────────┐
    │ Pass to Component │
    │ via Props/Context │
    └────┬──────────────┘
         │
    ┌────▼───────────────┐
    │ Component Renders  │
    │ UI with Data       │
    └────────────────────┘
```

---

## 5️⃣ Constants Organization

```
📂 constants/
│
├─ colors.ts
│  ├─ primary: '#00A3FF'      (Xanh Dương)
│  ├─ accent: '#FFC72C'       (Vàng Nắng)
│  ├─ success: '#4CAF50'      (Xanh Lá)
│  ├─ error: '#F44336'        (Đỏ)
│  ├─ textMain: '#212121'
│  ├─ textSecondary: '#808080'
│  ├─ bgMain: '#FFFFFF'
│  ├─ bgCard: '#F5F5F5'
│  └─ ... (28 màu sắc tổng cộng)
│
├─ spacing.ts
│  ├─ xs: 4
│  ├─ sm: 8
│  ├─ md: 12
│  ├─ lg: 16
│  ├─ xl: 20
│  ├─ xxl: 24
│  ├─ xxxl: 32
│  └─ huge: 48
│
│  BORDER_RADIUS:
│  ├─ sm: 4
│  ├─ md: 8
│  ├─ lg: 12
│  ├─ xl: 16
│  ├─ xxl: 20
│  └─ full: 999
│
└─ index.ts (Export all)
```

---

## 6️⃣ Type Definitions

```
📂 types/
│
└─ index.ts
   ├─ interface Hotel
   │  ├─ id: string
   │  ├─ name: string
   │  ├─ location: string
   │  ├─ image: string
   │  ├─ price: number
   │  ├─ rating: number
   │  ├─ reviewCount: number
   │  └─ isFavorite: boolean
   │
   ├─ interface User
   │  ├─ id: string
   │  ├─ name: string
   │  ├─ email: string
   │  ├─ avatar: string
   │  └─ bio: string
   │
   ├─ interface Itinerary
   │  ├─ id: string
   │  ├─ title: string
   │  ├─ destination: string
   │  ├─ startDate: string
   │  ├─ activities: Activity[]
   │  └─ notes: string
   │
   ├─ interface Notification
   │  ├─ id: string
   │  ├─ title: string
   │  ├─ type: 'booking' | 'promotion' | 'update' | 'alert'
   │  ├─ timestamp: string
   │  └─ isRead: boolean
   │
   └─ type RootTabParamList
      ├─ home: undefined
      ├─ favorites: undefined
      ├─ itinerary: undefined
      ├─ notifications: undefined
      └─ profile: undefined
```

---

## 7️⃣ Component Pattern Example

```
📂 components/
   └─ 📂 common/
      └─ 📂 hotelCard/
         │
         ├─ HotelCard.tsx (Component logic)
         │  ├─ Import types
         │  ├─ Import styles
         │  └─ Export component
         │
         ├─ HotelCard.types.ts (Props definition)
         │  └─ interface HotelCardProps {
         │       hotel: Hotel;
         │       onPress: (id: string) => void;
         │     }
         │
         ├─ HotelCard.styles.ts (Stylesheet)
         │  └─ StyleSheet.create({
         │       container: { ... },
         │       image: { ... },
         │       title: { ... },
         │       price: { ... }
         │     })
         │
         └─ index.ts (Export for easier imports)
            └─ export { default } from './HotelCard';
```

---

## 8️⃣ Import Paths (Using Aliases)

```typescript
// ✅ RECOMMENDED (Alias paths)
import { COLORS, SPACING } from '@/constants';
import { Hotel } from '@/types';
import HomeScreen from '@/screens/HomeScreen/HomeScreen';
import HotelCard from '@/components/common/hotelCard';

// ❌ NOT RECOMMENDED (Relative paths)
import { COLORS, SPACING } from '../../../../constants';
import { Hotel } from '../../../../types';
import HomeScreen from '../../../../screens/HomeScreen/HomeScreen';
import HotelCard from '../../common/hotelCard';
```

---

## 9️⃣ Common Patterns

### Pattern 1: Screen with Components
```
Screen Component
├─ Layout (ScrollView, FlatList, etc.)
├─ Sub-components
│  ├─ Header
│  ├─ Cards
│  └─ Footer
└─ State management (useState, useContext, etc.)
```

### Pattern 2: Reusable Component
```
Component
├─ Props (TypeScript interface)
├─ Internal state (if needed)
├─ Styling (StyleSheet.create)
└─ JSX return
```

### Pattern 3: Service Layer
```
Service
├─ API client setup
├─ Request interceptors
├─ Error handling
└─ Data transformation
```

---

## 🔟 Project Development Workflow

```
┌─────────────────────────────────────────────────┐
│           Start New Feature                     │
└────────┬────────────────────────────────────────┘
         │
    ┌────▼────────────────────┐
    │ Create Feature Branch   │
    │ git checkout -b         │
    │ feature/my-feature      │
    └────┬───────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 1. Create/Update Types (if needed)│
    │    → src/types/index.ts           │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 2. Create Services (if needed)    │
    │    → src/services/myService.ts    │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 3. Create Components              │
    │    → src/components/myComponent/  │
    │       ├─ Component.tsx            │
    │       ├─ Component.types.ts       │
    │       ├─ Component.styles.ts      │
    │       └─ index.ts                 │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 4. Integrate into Screen          │
    │    → src/screens/SomeScreen.tsx   │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 5. Test on Expo Go                │
    │    npm start                      │
    │    Scan QR code                   │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 6. Run Linter                     │
    │    npm run lint                   │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 7. Commit & Push                  │
    │    git add .                      │
    │    git commit -m "feat(...)"      │
    │    git push origin feature/...    │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 8. Pull Request & Review          │
    │    Code Review by team            │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │ 9. Merge to Develop               │
    │    git merge feature/my-feature   │
    └────────────────────────────────────┘
```

---

## 🔗 Related Documentation

- **PROJECT_STRUCTURE.md** - Chi tiết cấu trúc thư mục
- **coding_convention.md** - Quy ước code của team
- **README.md** - Giới thiệu project

---

**Created:** October 26, 2025  
**Last Updated:** October 26, 2025
