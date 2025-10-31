# Coding Convention - Travel Mobile App


## 🏷️ Quy tắc đặt tên

### 1. Components (React Native)
- **PascalCase** cho tên component
- Sử dụng prefix mô tả chức năng
- Ví dụ:
  ```typescript
  // ✅ Đúng
  TravelCard.tsx
  HotelBookingForm.tsx
  DestinationMap.tsx
  UserProfileScreen.tsx
  
  // ❌ Sai
  card.tsx
  booking.tsx
  map.tsx
  ```

### 2. Files và Folders
- **camelCase** cho files và folders
- Sử dụng tên mô tả rõ ràng
- Ví dụ:
  ```
  // ✅ Đúng
  components/
    hotelCard/
      HotelCard.tsx
      HotelCard.styles.ts
      HotelCard.types.ts
  screens/
    bookingScreen/
      BookingScreen.tsx
  utils/
    dateFormatter.ts
    apiClient.ts
  ```

### 3. Variables và Functions
- **camelCase** cho variables và functions
- Tên phải mô tả rõ chức năng
- Ví dụ:
  ```typescript
  // ✅ Đúng
  const userBookings = [];
  const calculateTotalPrice = () => {};
  const isHotelAvailable = true;
  
  // ❌ Sai
  const data = [];
  const calc = () => {};
  const flag = true;
  ```

### 4. Constants
- **UPPER_SNAKE_CASE** cho constants
- Ví dụ:
  ```typescript
  // ✅ Đúng
  const API_BASE_URL = 'https://api.travel-app.com';
  const MAX_BOOKING_DAYS = 30;
  const DEFAULT_CURRENCY = 'VND';
  ```

### 5. Types và Interfaces
- **PascalCase** với prefix mô tả
- Ví dụ:
  ```typescript
  // ✅ Đúng
  interface HotelBooking {
    id: string;
    hotelName: string;
    checkInDate: Date;
    checkOutDate: Date;
  }
  
  type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
  ```

---

## 🌿 Git Workflow

### Branch Structure
```
main (production)
├── develop (staging)
    ├── feature/user-authentication
    ├── feature/hotel-booking
    ├── feature/payment-integration
    └── hotfix/critical-bug-fix
```

### Branch Roles
- **main**: Nhánh production, chỉ chứa code đã được test và deploy
- **develop**: Nhánh integration, nơi merge các feature branches
- **feature/**: Nhánh phát triển tính năng mới

---

## 📝 Commit Convention

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
- **feat**: Tính năng mới
- **fix**: Sửa lỗi
- **docs**: Cập nhật documentation
- **style**: Formatting, không thay đổi logic
- **refactor**: Refactor code
- **test**: Thêm hoặc sửa tests
- **chore**: Cập nhật build tools, dependencies

### Scope (Optional)
- **auth**: Authentication related
- **booking**: Booking system
- **payment**: Payment integration
- **ui**: User interface
- **api**: API related
- **config**: Configuration

### Examples
```bash
# ✅ Đúng
feat(auth): add login with Google OAuth
fix(booking): resolve date validation issue
docs: update API documentation
refactor(ui): improve hotel card component performance
chore: update dependencies to latest versions

# ❌ Sai
update code
fix bug
add feature
```

---

## 🌿 Branch Naming

### Feature Branches
```
feature/<feature-name>
```
Ví dụ:
- `feature/user-registration`
- `feature/hotel-search`
- `feature/payment-integration`
- `feature/travel-guide`

### Hotfix Branches
```
hotfix/<issue-description>
```
Ví dụ:
- `hotfix/login-crash`
- `hotfix/booking-calculation-error`

### Release Branches
```
release/<version>
```
Ví dụ:
- `release/v1.2.0`
- `release/v2.0.0`

---

## 💻 Code Style

### TypeScript
- Sử dụng strict mode
- Luôn define types cho props và state
- Sử dụng interfaces thay vì types khi có thể extend

```typescript
// ✅ Đúng
interface HotelCardProps {
  hotel: Hotel;
  onPress: (hotelId: string) => void;
  isBookmarked: boolean;
}

const HotelCard: React.FC<HotelCardProps> = ({ hotel, onPress, isBookmarked }) => {
  // Component logic
};
```

### React Native Components
- Sử dụng functional components với hooks
- Tách styles ra file riêng
- Sử dụng TypeScript cho props

```typescript
// HotelCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './HotelCard.styles';
import { HotelCardProps } from './HotelCard.types';

const HotelCard: React.FC<HotelCardProps> = ({ hotel, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(hotel.id)}>
      <Text style={styles.title}>{hotel.name}</Text>
    </TouchableOpacity>
  );
};

export default HotelCard;
```

### File Organization
```
components/
  hotelCard/
    HotelCard.tsx
    HotelCard.styles.ts
    HotelCard.types.ts
    index.ts
```

## 🔧 Development Guidelines

### Before Committing
1. Chạy linter: `npm run lint`
2. Test trên cả iOS và Android
3. Kiểm tra TypeScript compilation
4. Review code với team

### Code Review Checklist
- [ ] Code follows naming conventions
- [ ] TypeScript types are properly defined
- [ ] Components are properly structured
- [ ] No console.log statements in production code
- [ ] Error handling is implemented
- [ ] Performance considerations are addressed

---
