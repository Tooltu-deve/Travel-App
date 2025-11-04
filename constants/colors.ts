/**
 * Color constants based on design system
 * Synchronized with tailwind.config.js
 */

export const COLORS = {
  // I. MÀU CHỦ ĐẠO (Primary & Accent) - From Tailwind
  primary: '#00A3FF',           // Xanh Dương Sáng - Primary color
  accent: '#FFC72C',            // Vàng Nắng Rực rỡ - Accent color

  // II. MÀU NỀN & VĂN BẢN (Background & Text) - From Tailwind
  bgMain: '#FFFFFF',            // Nền chính (Background)
  bgCard: '#F5F5F5',            // Nền thẻ/Card
  bgSecondary: '#FAFAFA',       // Nền phụ
  bgLight: '#e0f4ff',           // Nền xanh nhạt (Extended)
  bgLightBlue: '#f0f9ff',       // Nền xanh rất nhạt (Extended)

  textMain: '#212121',          // Văn bản chính
  textSecondary: '#808080',     // Văn bản phụ
  textDark: '#1a1a1a',          // Văn bản tối (Extended)
  textLight: '#e0e0e0',         // Văn bản nhạt (Extended)
  textWhite: '#FFFFFF',         // Văn bản trắng (Extended)

  // III. MÀU TƯƠNG TÁC & TRẠNG THÁI (Status Colors) - From Tailwind
  success: '#4CAF50',           // Màu thành công (Xanh Lá cây)
  error: '#F44336',             // Màu lỗi (Đỏ Tươi)
  warning: '#FF9800',           // Màu cảnh báo (Cam) - Optional
  loading: '#00A3FF',           // Màu loading (dùng primary)
  disabled: '#CCCCCC',          // Màu disabled

  // IV. MÀU ĐẶC BIỆT DỰ LỊCH (Special/Activity Colors) - From Tailwind
  icon: '#4A4A4A',              // Màu biểu tượng
  iconInactive: '#8E9AAF',      // Màu icon inactive (Extended)
  border: '#E0E0E0',            // Màu border
  borderLight: '#d1e9ff',       // Màu border nhạt (Extended)
  rating: '#FFC300',            // Đánh giá/Sao (Gold) - From Tailwind
  ratingAlt: '#FFD700',         // Màu sao vàng đậm (Extended)
  priceLow: '#8BC34A',          // Chi phí Thấp/Giá tốt (Xanh Lá)
  priceHigh: '#AB47BC',         // Chi phí Cao/Giá cao (Tím)

  // V. MÀU ĐẶC BIỆT (Special Colors) - Extended
  favorite: '#FF6B6B',          // Màu yêu thích
  favoriteActive: '#ff3b5c',    // Màu yêu thích active
  favoriteBg: '#ffe5ea',        // Nền yêu thích

  // VI. GRADIENT COLORS - Extended
  gradientStart: '#FFFFFF',     // Gradient bắt đầu
  gradientBlue1: '#e8f9ff',     // Gradient xanh nhạt 1
  gradientBlue2: '#d1f2ff',     // Gradient xanh nhạt 2
  gradientBlue3: '#a9e3fcff',   // Gradient xanh nhạt 3
  gradientSecondary: '#60a5ff',  // Gradient phụ
  gradientChat: '#b4d2ffff',     // Gradient chat button

  // VII. TRANSPARENCY - Extended
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  primaryTransparent: 'rgba(0, 163, 255, 0)',
  primaryLight: 'rgba(0, 163, 255, 0.15)',
  primaryMedium: 'rgba(0, 163, 255, 0.25)',
  primaryStrong: 'rgba(0, 163, 255, 0.3)',
} as const;

export type ColorKey = keyof typeof COLORS;
