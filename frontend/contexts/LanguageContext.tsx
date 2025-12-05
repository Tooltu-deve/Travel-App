import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'vi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (text: string) => string;
  translateText: (text: string) => Promise<string>;
  isTranslating: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Cache để lưu các bản dịch đã dịch
const translationCache: Record<string, Record<Language, string>> = {};

// Các từ/cụm từ cố định - dịch sẵn để không cần gọi API
const staticTranslations: Record<string, Record<Language, string>> = {
  // Profile screen
  'Cài đặt chung': { vi: 'Cài đặt chung', en: 'General Settings' },
  'Ngôn ngữ': { vi: 'Ngôn ngữ', en: 'Language' },
  'Tiếng Việt': { vi: 'Tiếng Việt', en: 'Vietnamese' },
  'Tài khoản': { vi: 'Tài khoản', en: 'Account' },
  'Chỉnh sửa thông tin': { vi: 'Chỉnh sửa thông tin', en: 'Edit Profile' },
  'Mật khẩu & Bảo mật': { vi: 'Mật khẩu & Bảo mật', en: 'Password & Security' },
  'Hỗ trợ': { vi: 'Hỗ trợ', en: 'Support' },
  'Đăng xuất': { vi: 'Đăng xuất', en: 'Log Out' },
  'Chọn ngôn ngữ': { vi: 'Chọn ngôn ngữ', en: 'Select Language' },
  'Đóng': { vi: 'Đóng', en: 'Close' },
  'Hủy': { vi: 'Hủy', en: 'Cancel' },
  'Bạn có chắc chắn muốn đăng xuất?': { vi: 'Bạn có chắc chắn muốn đăng xuất?', en: 'Are you sure you want to log out?' },
  'Thành viên từ 2024 · Thành viên cơ bản': { vi: 'Thành viên từ 2024 · Thành viên cơ bản', en: 'Member since 2024 · Basic Member' },
  
  // Edit Profile screen
  'Chỉnh sửa hồ sơ': { vi: 'Chỉnh sửa hồ sơ', en: 'Edit Profile' },
  'Thông tin cá nhân': { vi: 'Thông tin cá nhân', en: 'Personal Information' },
  'Họ và tên': { vi: 'Họ và tên', en: 'Full Name' },
  'Email': { vi: 'Email', en: 'Email' },
  'Số điện thoại': { vi: 'Số điện thoại', en: 'Phone Number' },
  'Sở thích du lịch': { vi: 'Sở thích du lịch', en: 'Travel Preferences' },
  'Chưa có sở thích nào': { vi: 'Chưa có sở thích nào', en: 'No preferences yet' },
  'Lưu thay đổi': { vi: 'Lưu thay đổi', en: 'Save Changes' },
  'Đang lưu...': { vi: 'Đang lưu...', en: 'Saving...' },
  'Cập nhật thành công!': { vi: 'Cập nhật thành công!', en: 'Updated successfully!' },
  'Thành công': { vi: 'Thành công', en: 'Success' },
  'Lỗi': { vi: 'Lỗi', en: 'Error' },
  'Không thể cập nhật thông tin': { vi: 'Không thể cập nhật thông tin', en: 'Unable to update information' },
  
  // Change Password screen
  'Đổi mật khẩu': { vi: 'Đổi mật khẩu', en: 'Change Password' },
  'Mật khẩu hiện tại': { vi: 'Mật khẩu hiện tại', en: 'Current Password' },
  'Mật khẩu mới': { vi: 'Mật khẩu mới', en: 'New Password' },
  'Xác nhận mật khẩu mới': { vi: 'Xác nhận mật khẩu mới', en: 'Confirm New Password' },
  'Nhập mật khẩu hiện tại': { vi: 'Nhập mật khẩu hiện tại', en: 'Enter current password' },
  'Nhập mật khẩu mới': { vi: 'Nhập mật khẩu mới', en: 'Enter new password' },
  'Nhập lại mật khẩu mới': { vi: 'Nhập lại mật khẩu mới', en: 'Re-enter new password' },
  'Cập nhật mật khẩu': { vi: 'Cập nhật mật khẩu', en: 'Update Password' },
  'Vui lòng nhập đầy đủ thông tin': { vi: 'Vui lòng nhập đầy đủ thông tin', en: 'Please fill in all fields' },
  'Mật khẩu mới không khớp': { vi: 'Mật khẩu mới không khớp', en: 'New passwords do not match' },
  'Mật khẩu phải có ít nhất 6 ký tự': { vi: 'Mật khẩu phải có ít nhất 6 ký tự', en: 'Password must be at least 6 characters' },
  'Đổi mật khẩu thành công!': { vi: 'Đổi mật khẩu thành công!', en: 'Password changed successfully!' },
  
  // FAQ screen
  'Câu hỏi thường gặp': { vi: 'Câu hỏi thường gặp', en: 'Frequently Asked Questions' },
  'Làm thế nào để tạo lộ trình du lịch?': { vi: 'Làm thế nào để tạo lộ trình du lịch?', en: 'How to create a travel itinerary?' },
  'Bạn có thể tạo lộ trình bằng cách nhấn vào tab "Lộ trình" ở thanh điều hướng, sau đó chọn "Tạo lộ trình mới".': { vi: 'Bạn có thể tạo lộ trình bằng cách nhấn vào tab "Lộ trình" ở thanh điều hướng, sau đó chọn "Tạo lộ trình mới".', en: 'You can create an itinerary by tapping the "Itinerary" tab in the navigation bar, then select "Create new itinerary".' },
  'Làm sao để lưu địa điểm yêu thích?': { vi: 'Làm sao để lưu địa điểm yêu thích?', en: 'How to save favorite places?' },
  'Nhấn vào biểu tượng trái tim trên mỗi địa điểm để thêm vào danh sách yêu thích của bạn.': { vi: 'Nhấn vào biểu tượng trái tim trên mỗi địa điểm để thêm vào danh sách yêu thích của bạn.', en: 'Tap the heart icon on each place to add it to your favorites list.' },
  'Tôi có thể chia sẻ lộ trình không?': { vi: 'Tôi có thể chia sẻ lộ trình không?', en: 'Can I share my itinerary?' },
  'Có, bạn có thể chia sẻ lộ trình với bạn bè qua các ứng dụng nhắn tin hoặc mạng xã hội.': { vi: 'Có, bạn có thể chia sẻ lộ trình với bạn bè qua các ứng dụng nhắn tin hoặc mạng xã hội.', en: 'Yes, you can share your itinerary with friends via messaging apps or social media.' },
  'Ứng dụng có hoạt động offline không?': { vi: 'Ứng dụng có hoạt động offline không?', en: 'Does the app work offline?' },
  'Một số tính năng cơ bản có thể hoạt động offline, nhưng để có trải nghiệm tốt nhất, bạn nên kết nối internet.': { vi: 'Một số tính năng cơ bản có thể hoạt động offline, nhưng để có trải nghiệm tốt nhất, bạn nên kết nối internet.', en: 'Some basic features work offline, but for the best experience, you should have an internet connection.' },
  'Làm thế nào để liên hệ hỗ trợ?': { vi: 'Làm thế nào để liên hệ hỗ trợ?', en: 'How to contact support?' },
  'Bạn có thể gửi email đến support@travelapp.com hoặc sử dụng tính năng chat trong ứng dụng.': { vi: 'Bạn có thể gửi email đến support@travelapp.com hoặc sử dụng tính năng chat trong ứng dụng.', en: 'You can send an email to support@travelapp.com or use the in-app chat feature.' },
  
  // Home screen
  'Xin chào': { vi: 'Xin chào', en: 'Hello' },
  'Khám phá': { vi: 'Khám phá', en: 'Explore' },
  'Địa điểm nổi bật': { vi: 'Địa điểm nổi bật', en: 'Featured Places' },
  'Xem tất cả': { vi: 'Xem tất cả', en: 'See All' },
  'Danh mục': { vi: 'Danh mục', en: 'Categories' },
  'Đánh giá gần đây': { vi: 'Đánh giá gần đây', en: 'Recent Reviews' },
  'Đang tải...': { vi: 'Đang tải...', en: 'Loading...' },
  
  // Favorites screen
  'Yêu thích': { vi: 'Yêu thích', en: 'Favorites' },
  'Danh sách yêu thích': { vi: 'Danh sách yêu thích', en: 'Favorites List' },
  'Chưa có địa điểm yêu thích': { vi: 'Chưa có địa điểm yêu thích', en: 'No favorite places yet' },
  'Hãy khám phá và thêm địa điểm yêu thích!': { vi: 'Hãy khám phá và thêm địa điểm yêu thích!', en: 'Explore and add your favorite places!' },
  'Tất cả': { vi: 'Tất cả', en: 'All' },
  
  // Itinerary screen
  'Lộ trình': { vi: 'Lộ trình', en: 'Itinerary' },
  'Lộ trình của tôi': { vi: 'Lộ trình của tôi', en: 'My Itineraries' },
  'Tạo lộ trình mới': { vi: 'Tạo lộ trình mới', en: 'Create New Itinerary' },
  'Chưa có lộ trình nào': { vi: 'Chưa có lộ trình nào', en: 'No itineraries yet' },
  'Hãy tạo lộ trình đầu tiên!': { vi: 'Hãy tạo lộ trình đầu tiên!', en: 'Create your first itinerary!' },
  'ngày': { vi: 'ngày', en: 'days' },
  'địa điểm': { vi: 'địa điểm', en: 'places' },
  
  // Notifications screen
  'Thông báo': { vi: 'Thông báo', en: 'Notifications' },
  'Chưa có thông báo': { vi: 'Chưa có thông báo', en: 'No notifications yet' },
  
  // Favorites screen - more
  'Yêu thích của tôi': { vi: 'Yêu thích của tôi', en: 'My Favorites' },
  'Các địa điểm yêu thích theo tâm trạng': { vi: 'Các địa điểm yêu thích theo tâm trạng', en: 'Favorite places by mood' },
  'Địa điểm yêu thích': { vi: 'Địa điểm yêu thích', en: 'Favorite Places' },
  'Bạn chưa có địa điểm yêu thích': { vi: 'Bạn chưa có địa điểm yêu thích', en: 'You have no favorite places' },
  'Thêm địa điểm bạn thích để lưu lại và xem sau.': { vi: 'Thêm địa điểm bạn thích để lưu lại và xem sau.', en: 'Add places you like to save and view later.' },
  'Khám phá địa điểm': { vi: 'Khám phá địa điểm', en: 'Explore Places' },
  
  // Itinerary screen - more
  'Lịch trình của bạn': { vi: 'Lịch trình của bạn', en: 'Your Itineraries' },
  'Quản lý các hành trình du lịch': { vi: 'Quản lý các hành trình du lịch', en: 'Manage your travel journeys' },
  'Lộ trình hiện tại': { vi: 'Lộ trình hiện tại', en: 'Current Itinerary' },
  'Lộ trình khác': { vi: 'Lộ trình khác', en: 'Other Itineraries' },
  'Các lộ trình đã lưu': { vi: 'Các lộ trình đã lưu', en: 'Saved Itineraries' },
  'Đang tải lộ trình...': { vi: 'Đang tải lộ trình...', en: 'Loading itineraries...' },
  'Chưa có lộ trình nào được xác nhận.': { vi: 'Chưa có lộ trình nào được xác nhận.', en: 'No confirmed itineraries yet.' },
  'Tạo lộ trình đầu tiên của bạn để bắt đầu hành trình': { vi: 'Tạo lộ trình đầu tiên của bạn để bắt đầu hành trình', en: 'Create your first itinerary to start your journey' },
  'Đang diễn ra': { vi: 'Đang diễn ra', en: 'In Progress' },
  'Sắp tới': { vi: 'Sắp tới', en: 'Upcoming' },
  'Đã hoàn thành': { vi: 'Đã hoàn thành', en: 'Completed' },
  'Đã lưu': { vi: 'Đã lưu', en: 'Saved' },
  
  // Home screen - more
  'Chào mừng': { vi: 'Chào mừng', en: 'Welcome' },
  'Điểm đến nổi bật': { vi: 'Điểm đến nổi bật', en: 'Featured Destinations' },
  'Đánh giá': { vi: 'Đánh giá', en: 'Reviews' },
  
  // Edit profile - more
  'tâm trạng': { vi: 'tâm trạng', en: 'moods' },
  'Đã chọn': { vi: 'Đã chọn', en: 'Selected' },
  'Chọn tối đa 3 tâm trạng/sở thích yêu thích của bạn': { vi: 'Chọn tối đa 3 tâm trạng/sở thích yêu thích của bạn', en: 'Choose up to 3 favorite moods/preferences' },
  
  // Create itinerary screen
  'Tạo lộ trình': { vi: 'Tạo lộ trình', en: 'Create Itinerary' },
  'Chọn cách tạo lộ trình': { vi: 'Chọn cách tạo lộ trình', en: 'Choose how to create' },
  'Tạo với SmartAgent': { vi: 'Tạo với SmartAgent', en: 'Create with SmartAgent' },
  'AI sẽ giúp bạn lên kế hoạch': { vi: 'AI sẽ giúp bạn lên kế hoạch', en: 'AI will help you plan' },
  'Tạo thủ công': { vi: 'Tạo thủ công', en: 'Create Manually' },
  'Tự chọn địa điểm theo ý thích': { vi: 'Tự chọn địa điểm theo ý thích', en: 'Choose places yourself' },
  
  // Smart Agent Form
  'Nhập thông tin để tạo lộ trình': { vi: 'Nhập thông tin để tạo lộ trình', en: 'Enter information to create itinerary' },
  'Ngân sách': { vi: 'Ngân sách', en: 'Budget' },
  'Miễn phí': { vi: 'Miễn phí', en: 'Free' },
  'Rẻ': { vi: 'Rẻ', en: 'Cheap' },
  'Hợp lý': { vi: 'Hợp lý', en: 'Affordable' },
  'Đắt': { vi: 'Đắt', en: 'Expensive' },
  'Điểm đến': { vi: 'Điểm đến', en: 'Destination' },
  'Chọn thành phố...': { vi: 'Chọn thành phố...', en: 'Select city...' },
  'Chọn thành phố': { vi: 'Chọn thành phố', en: 'Select City' },
  'Tâm trạng': { vi: 'Tâm trạng', en: 'Mood' },
  'Số ngày du lịch': { vi: 'Số ngày du lịch', en: 'Number of Days' },
  'Vị trí hiện tại': { vi: 'Vị trí hiện tại', en: 'Current Location' },
  'Thời gian khởi hành (Tùy chọn)': { vi: 'Thời gian khởi hành (Tùy chọn)', en: 'Departure Time (Optional)' },
  'Chọn ngày': { vi: 'Chọn ngày', en: 'Select Date' },
  'Chọn giờ': { vi: 'Chọn giờ', en: 'Select Time' },
  'Tạo lộ trình': { vi: 'Tạo lộ trình', en: 'Create Itinerary' },
  
  // Route Preview
  'Xác Nhận Lưu': { vi: 'Xác Nhận Lưu', en: 'Confirm Save' },
  'Đặt tên cho lộ trình': { vi: 'Đặt tên cho lộ trình', en: 'Name Your Itinerary' },
  'Hãy nhập tên để dễ dàng quản lý trong danh sách lộ trình của bạn.': { vi: 'Hãy nhập tên để dễ dàng quản lý trong danh sách lộ trình của bạn.', en: 'Enter a name to easily manage in your itinerary list.' },
  'Lưu': { vi: 'Lưu', en: 'Save' },
  'Hủy lộ trình': { vi: 'Hủy lộ trình', en: 'Cancel Itinerary' },
  'Bạn có chắc chắn muốn hủy lộ trình này?': { vi: 'Bạn có chắc chắn muốn hủy lộ trình này?', en: 'Are you sure you want to cancel this itinerary?' },
  'Không': { vi: 'Không', en: 'No' },
  'Có': { vi: 'Có', en: 'Yes' },
  'Lộ trình đã được lưu thành công!': { vi: 'Lộ trình đã được lưu thành công!', en: 'Itinerary saved successfully!' },
  'Điểm Bắt đầu': { vi: 'Điểm Bắt đầu', en: 'Starting Point' },
  'Di chuyển': { vi: 'Di chuyển', en: 'Travel' },
  'phút': { vi: 'phút', en: 'minutes' },
  'Không có hoạt động nào trong ngày này': { vi: 'Không có hoạt động nào trong ngày này', en: 'No activities for this day' },
  'Đang tải lộ trình...': { vi: 'Đang tải lộ trình...', en: 'Loading itinerary...' },
  'NGÀY': { vi: 'NGÀY', en: 'DAY' },
  
  // Tabs
  'Trang chủ': { vi: 'Trang chủ', en: 'Home' },
  'Cá nhân': { vi: 'Cá nhân', en: 'Profile' },
  
  // Common
  'OK': { vi: 'OK', en: 'OK' },
  'Xong': { vi: 'Xong', en: 'Done' },
  'Tiếp tục': { vi: 'Tiếp tục', en: 'Continue' },
  'Quay lại': { vi: 'Quay lại', en: 'Back' },
  'Tìm kiếm': { vi: 'Tìm kiếm', en: 'Search' },
  'Không tìm thấy': { vi: 'Không tìm thấy', en: 'Not found' },
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');
  const [isTranslating, setIsTranslating] = useState(false);

  // Load saved language on mount
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLanguage');
        if (savedLang === 'vi' || savedLang === 'en') {
          setLanguageState(savedLang);
        }
      } catch (error) {
        console.log('Error loading language:', error);
      }
    };
    loadLanguage();
  }, []);

  // Save language when changed
  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem('appLanguage', lang);
    } catch (error) {
      console.log('Error saving language:', error);
    }
  }, []);

  // Translate text synchronously using static translations
  const t = useCallback((text: string): string => {
    // Check static translations first
    if (staticTranslations[text]) {
      return staticTranslations[text][language];
    }
    
    // Check cache
    if (translationCache[text] && translationCache[text][language]) {
      return translationCache[text][language];
    }
    
    // Return original text if no translation found
    return text;
  }, [language]);

  // Translate text using Google Translate API (for dynamic content)
  const translateText = useCallback(async (text: string): Promise<string> => {
    if (language === 'vi') return text; // No need to translate if Vietnamese
    
    // Check static translations first
    if (staticTranslations[text]) {
      return staticTranslations[text][language];
    }
    
    // Check cache
    if (translationCache[text] && translationCache[text][language]) {
      return translationCache[text][language];
    }

    try {
      setIsTranslating(true);
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY;
      
      if (!apiKey) {
        console.warn('Google Translate API key not configured');
        return text;
      }

      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
            source: 'vi',
            target: language,
            format: 'text',
          }),
        }
      );

      const data = await response.json();
      
      if (data.data?.translations?.[0]?.translatedText) {
        const translatedText = data.data.translations[0].translatedText;
        
        // Cache the translation
        if (!translationCache[text]) {
          translationCache[text] = { vi: text, en: text };
        }
        translationCache[text][language] = translatedText;
        
        return translatedText;
      }
      
      return text;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    } finally {
      setIsTranslating(false);
    }
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t,
    translateText,
    isTranslating,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
