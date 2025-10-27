/**
 * Color constants based on design system
 * 
 * Tham khảo: Design Color Palette
 */

export const COLORS = {
  // I. MÀU CHỦ ĐẠO (Primary & Accent)
  primary: '#00A3FF',           // Xanh Dương Sáng - Primary color
  accent: '#FFC72C',            // Vàng Nắng Rực rỡ - Accent color

  // II. MÀU NỀN & VĂN BẢN (Background & Text)
  bgMain: '#FFFFFF',            // Nền chính (Background)
  bgCard: '#F5F5F5',            // Nền thẻ/Card
  bgSecondary: '#FAFAFA',       // Nền phụ

  textMain: '#212121',          // Văn bản chính
  textSecondary: '#808080',     // Văn bản phụ

  // III. MÀU TƯƠNG TÁC & TRẠNG THÁI (Status Colors)
  success: '#4CAF50',           // Màu thành công (Xanh Lá cây)
  error: '#F44336',             // Màu lỗi (Đỏ Tươi)
  warning: '#FF9800',           // Màu cảnh báo (Cam) - Optional
  loading: '#00A3FF',           // Màu loading (dùng primary)
  disabled: '#CCCCCC',          // Màu disabled

  // IV. MÀU ĐẶC BIỆT DỰ LỊCH (Special/Activity Colors)
  icon: '#4A4A4A',              // Màu biểu tượng
  border: '#E0E0E0',            // Màu border
  rating: '#FFC300',            // Đánh giá/Sao (Gold)
  priceLow: '#8BC34A',          // Chi phí Thấp/Giá tốt (Xanh Lá)
  priceHigh: '#AB47BC',         // Chi phí Cao/Giá cao (Tím)

  // Transparency
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
} as const;

export type ColorKey = keyof typeof COLORS;
