import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAQ_DATA = [
  {
    category: 'Về Tài khoản & Dữ liệu (Account & Data)',
    items: [
      {
        q: 'Tôi có thể sử dụng tài khoản trên nhiều thiết bị không?',
        a: 'Có, chỉ cần đăng nhập cùng một tài khoản, mọi lộ trình và dữ liệu của bạn sẽ được đồng bộ hóa tự động trên tất cả các thiết bị (điện thoại, máy tính bảng).',
      },
      {
        q: 'Làm thế nào để thay đổi thông tin cá nhân hoặc mật khẩu?',
        a: 'Bạn có thể vào mục "Chỉnh sửa hồ sơ" (Edit Profile) để cập nhật tên, ảnh đại diện và đổi mật khẩu trong phần "Bảo mật".',
      },
      {
        q: 'Dữ liệu lịch trình của tôi có được bảo mật không?',
        a: 'Chúng tôi cam kết bảo mật tuyệt đối dữ liệu của bạn. Lộ trình của bạn chỉ được chia sẻ khi bạn chủ động chọn tính năng "Chia sẻ" hoặc "Công khai".',
      },
      {
        q: 'Làm sao để xóa tài khoản vĩnh viễn?',
        a: 'Bạn có thể yêu cầu xóa tài khoản trong phần "Cài đặt" -> "Xóa tài khoản". Lưu ý: Mọi dữ liệu chuyến đi sẽ không thể khôi phục.',
      },
    ],
  },
  {
    category: 'Về Tính năng Tạo Lộ trình (Itinerary Features)',
    items: [
      {
        q: 'Lộ trình được gợi ý dựa trên tiêu chí nào?',
        a: 'Hệ thống (hoặc AI) sẽ dựa trên sở thích, ngân sách, thời gian và phong cách du lịch (nghỉ dưỡng, khám phá, văn hóa...) mà bạn đã cung cấp để tạo ra lịch trình tối ưu nhất.',
      },
      {
        q: 'Tôi có thể chỉnh sửa lịch trình sau khi App đã tạo xong không?',
        a: 'Chắc chắn rồi. Bạn hoàn toàn có thể thêm, bớt địa điểm, thay đổi giờ giấc hoặc đảo thứ tự các ngày đi một cách thủ công.',
      },
      {
        q: 'Làm thế nào để chia sẻ lịch trình với bạn bè/người đồng hành?',
        a: 'Hãy nhấn nút "Chia sẻ" (Share) ở góc màn hình lộ trình. Bạn có thể gửi liên kết hoặc mời bạn bè vào cùng chỉnh sửa (đối với tính năng Group Trip).',
      },
      {
        q: 'Tôi có thể xuất lịch trình ra file PDF hoặc thêm vào Google Calendar không?',
        a: 'Có, bạn có thể tìm thấy tùy chọn "Xuất lộ trình" trong menu cài đặt của chuyến đi.',
      },
    ],
  },
  {
    category: 'Kỹ thuật & Tiện ích (Technical & Utilities)',
    items: [
      {
        q: 'Tôi có thể xem lộ trình khi không có Internet (Offline) không?',
        a: 'Có. App hỗ trợ chế độ Offline. Bạn chỉ cần tải xuống lộ trình trước khi khởi hành để xem bản đồ và thông tin khi không có mạng.',
      },
      {
        q: 'App có liên kết với Google Maps/Apple Maps không?',
        a: 'Có. Khi bấm vào một địa điểm trong lịch trình, App sẽ tự động điều hướng sang ứng dụng bản đồ mặc định trên điện thoại của bạn để chỉ đường.',
      },
      {
        q: 'Tôi bật thông báo nhắc nhở chuyến đi như thế nào?',
        a: 'Vào Cài đặt -> Thông báo và bật "Nhắc nhở lịch trình". App sẽ gửi thông báo trước giờ khởi hành hoặc giờ check-in các địa điểm.',
      },
    ],
  },
];

const FAQProfileScreen = () => {
  const [expanded, setExpanded] = useState<number[]>([0]);
  const insets = useSafeAreaInsets();

  const toggleGroup = (idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={[styles.headerRow, { paddingTop: insets.top || 16 }]}> 
        <TouchableOpacity onPress={() => require('expo-router').router.back()} style={styles.backButton} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2196F3" />
        </TouchableOpacity>
        <Text style={styles.title}>Câu hỏi thường gặp (FAQ)</Text>
      </View>
      {FAQ_DATA.map((group, idx) => (
        <View key={group.category} style={styles.group}>
          <TouchableOpacity style={styles.categoryRow} onPress={() => toggleGroup(idx)} activeOpacity={0.7}>
            <Text style={styles.category}>{idx + 1}. {group.category}</Text>
            <MaterialCommunityIcons
              name={expanded.includes(idx) ? 'chevron-up' : 'chevron-down'}
              size={26}
              color="#2196F3"
            />
          </TouchableOpacity>
          {expanded.includes(idx) && group.items.map((item) => (
            <View key={item.q} style={styles.qaBox}>
              <Text style={styles.question}>Q: {item.q}</Text>
              <Text style={styles.answer}>A: {item.a}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    marginRight: 8,
    padding: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2196F3',
    flex: 1,
    textAlign: 'center',
  },
  group: {
    marginBottom: 28,
  },
  category: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
  },
  qaBox: {
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  question: {
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 4,
    fontSize: 15,
  },
  answer: {
    color: '#1E293B',
    fontSize: 15,
    lineHeight: 21,
  },
});

export default FAQProfileScreen;
