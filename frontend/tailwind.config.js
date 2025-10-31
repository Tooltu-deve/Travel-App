/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors:{
        primary: '#00A3FF',        // Xanh Dương Sáng
        accent: '#FFC72C',         // Vàng Nắng Rực rỡ
        
        'bg-main': '#FFFFFF',      // Background chính
        'bg-card': '#F5F5F5',      // Background card
        
        'text-main': '#212121',    // Text chính
        'text-secondary': '#808080', // Text phụ
        
        success: '#4CAF50',        // Xanh Lá cây
        error: '#F44336',          // Đỏ Tươi
        loading: '#00A3FF',        // Sử dụng primary
        disabled: '#CCCCCC',       // Màu disabled
        icon: '#4A4A4A',          // Màu icon
        
        rating: '#FFC300',         // Màu rating
        'price-low': '#8BC34A',    // Giá thấp
        'price-high': '#AB47BC',   // Giá cao
      }
    },
  },
  plugins: [],
}