export const reviews = [
  {
    id: '1',
    userName: 'Nguyễn Văn A',
    location: 'Lenas Donau Hotel, Đà Nẵng',
    rating: 5,
    comment: 'Khách sạn rất đẹp và sạch sẽ, nhân viên phục vụ nhiệt tình. Tôi sẽ quay lại lần sau!',
    date: '2 ngày trước',
  },
  {
    id: '2',
    userName: 'Trần Thị B',
    location: 'Alpine Resort Hotel, Đà Lạt',
    rating: 4,
    comment: 'Vị trí thuận tiện, gần trung tâm. Phòng rộng rãi và thoải mái.',
    date: '1 tuần trước',
  },
  {
    id: '3',
    userName: 'Lê Minh C',
    location: 'Valley View Estate, Nha Trang',
    rating: 5,
    comment: 'Trải nghiệm tuyệt vời! Giá cả hợp lý, view đẹp. Highly recommended!',
    date: '2 tuần trước',
  },
  {
    id: '4',
    userName: 'Phạm Thu D',
    location: 'Lenas Donau Hotel, Đà Nẵng',
    rating: 4,
    comment: 'Dịch vụ tốt, đồ ăn ngon. Chỉ có điều wifi hơi yếu một chút.',
    date: '3 tuần trước',
  },
  {
    id: '5',
    userName: 'Hoàng Minh E',
    location: 'Beach Paradise Resort, Phú Quốc',
    rating: 5,
    comment: 'Resort sang trọng, view biển tuyệt đẹp. Bữa sáng buffet rất đa dạng và ngon. Nhân viên thân thiện và chuyên nghiệp.',
    date: '3 ngày trước',
  },
  {
    id: '6',
    userName: 'Đỗ Thị F',
    location: 'Mountain Lodge, Sa Pa',
    rating: 5,
    comment: 'Không gian yên tĩnh, không khí trong lành. View núi non hùng vĩ. Phòng ấm áp, thích hợp cho mùa đông.',
    date: '5 ngày trước',
  },
  {
    id: '7',
    userName: 'Vũ Công G',
    location: 'City Center Hotel, Hà Nội',
    rating: 4,
    comment: 'Vị trí trung tâm rất thuận tiện đi lại. Phòng sạch sẽ, giá cả hợp lý. Nhân viên lễ tân nhiệt tình hỗ trợ.',
    date: '1 tuần trước',
  },
  {
    id: '8',
    userName: 'Bùi Thị H',
    location: 'Riverside Hotel, Hội An',
    rating: 5,
    comment: 'Khách sạn nằm ngay bên sông Thu Bồn, view rất đẹp. Gần phố cổ chỉ 5 phút đi bộ. Nhân viên chu đáo, phục vụ tận tình.',
    date: '4 ngày trước',
  },
  {
    id: '9',
    userName: 'Ngô Văn I',
    location: 'Alpine Resort Hotel, Đà Lạt',
    rating: 5,
    comment: 'Không khí mát mẻ, view đồi thông tuyệt đẹp. Phòng ốc được trang trí theo phong cách châu Âu rất lãng mạn. Thích hợp cho cặp đôi.',
    date: '1 tuần trước',
  },
  {
    id: '10',
    userName: 'Đinh Thị K',
    location: 'Ocean View Resort, Vũng Tàu',
    rating: 4,
    comment: 'Resort view biển đẹp, hồ bơi rộng rãi. Bãi biển riêng sạch sẽ. Dịch vụ tốt nhưng giá hơi cao một chút.',
    date: '6 ngày trước',
  },
  {
    id: '11',
    userName: 'Lý Văn L',
    location: 'Valley View Estate, Nha Trang',
    rating: 5,
    comment: 'Căn hộ rất rộng rãi, view biển tuyệt đẹp. Có đầy đủ tiện nghi, bếp nấu ăn hiện đại. Phù hợp cho gia đình đông người.',
    date: '2 tuần trước',
  },
  {
    id: '12',
    userName: 'Mai Thị M',
    location: 'Boutique Hotel, TP.HCM',
    rating: 4,
    comment: 'Khách sạn boutique nhỏ xinh, thiết kế độc đáo. Nằm trong hẻm yên tĩnh nhưng vẫn gần trung tâm. Nhân viên thân thiện.',
    date: '3 ngày trước',
  },
];

export const featuredDestinations = [
  {
    id: '1',
    name: 'Lenas Donau Hotel',
    location: 'Donau Elegance',
    region: 'TYROLEAN ALPS',
    size: '34m²',
    distance: '1km to centre',
    guests: 2,
    duration: '10 days',
    amenities: ['1 king bed', 'Free wi-fi', 'TV'],
    price: '$80',
    reviews: '72k Reviews',
    rating: 4.8,
    image: require('../assets/images/test_address/anh-01-16859402497861207466047.png'),
  },
  {
    id: '2',
    name: 'Alpine Resort Hotel',
    location: 'Mountain Paradise',
    region: 'SWISS ALPS',
    size: '42m²',
    distance: '2km to centre',
    guests: 2,
    duration: '7 days',
    amenities: ['1 king bed', 'Free wi-fi', 'TV'],
    price: '$120',
    reviews: '45k Reviews',
    rating: 4.9,
    image: require('../assets/images/test_address/canh-dep-da-lat-1.png'),
  },
  {
    id: '3',
    name: 'Valley View Estate',
    location: 'Scenic Resort',
    region: 'VIETNAM COAST',
    size: '50m²',
    distance: '500m to beach',
    guests: 4,
    duration: '14 days',
    amenities: ['2 king beds', 'Free wi-fi', 'TV'],
    price: '₫2,200,000',
    reviews: '89k Reviews',
    rating: 4.7,
    image: require('../assets/images/test_address/cau-vang-ba-na-19072019-1.jpg'),
  },
];

export const categories = [
  { id: '1', name: 'Khách sạn', icon: 'hotel' },
  { id: '2', name: 'Nhà hàng', icon: 'restaurant' },
  { id: '3', name: 'Thuê xe', icon: 'car' },
  { id: '4', name: 'Voucher', icon: 'ticket' },
  { id: '5', name: 'Tour', icon: 'map-marker' },
  { id: '6', name: 'Vé máy bay', icon: 'plane' },
  { id: '7', name: 'Spa', icon: 'spa' },
  { id: '8', name: 'Sự kiện', icon: 'calendar' },
  { id: '9', name: 'Đặc sản', icon: 'gift' },
];

// --- Favorites mock data (moved here so all mocks live in one file) ---
export interface MockFavoritePlace {
  id: string;
  name: string;
  address: string;
  moods: string[];
  rating: number | null;
}

export const mockFavoritePlaces: MockFavoritePlace[] = [
  {
    id: '1',
    name: 'Bãi biển Nha Trang',
    address: 'Nha Trang, Khánh Hòa',
    moods: ['seaside', 'relaxing', 'scenic', 'peaceful'],
    rating: 4.5
  },
  {
    id: '2',
    name: 'Chùa Một Cột',
    address: 'Hà Nội',
    moods: ['historical', 'spiritual', 'cultural', 'peaceful'],
    rating: 4.2
  },
  {
    id: '3',
    name: 'Phố cổ Hội An',
    address: 'Hội An, Quảng Nam',
    moods: ['historical', 'cultural', 'romantic', 'traditional'],
    rating: 4.8
  },
  {
    id: '4',
    name: 'Vịnh Hạ Long',
    address: 'Quảng Ninh',
    moods: ['scenic', 'adventurous', 'peaceful', 'thrilling'],
    rating: 4.9
  },
  {
    id: '5',
    name: 'Cầu Vàng Bà Nà Hills',
    address: 'Đà Nẵng',
    moods: ['modern', 'scenic', 'exciting', 'family-friendly'],
    rating: 4.6
  },
  {
    id: '6',
    name: 'Chợ Bến Thành',
    address: 'Quận 1, TP.HCM',
    moods: ['lively', 'cultural', 'crowded', 'local_gem'],
    rating: 4.1
  },
  {
    id: '7',
    name: 'Đền Hùng',
    address: 'Phú Thọ',
    moods: ['historical', 'spiritual', 'cultural', 'traditional'],
    rating: 4.4
  },
  {
    id: '8',
    name: 'Suối Tiên',
    address: 'TP.HCM',
    moods: ['scenic', 'relaxing', 'family-friendly', 'peaceful'],
    rating: 4.3
  },
  {
    id: '9',
    name: 'Lăng Chủ tịch Hồ Chí Minh',
    address: 'Hà Nội',
    moods: ['historical', 'spiritual', 'cultural', 'solemn'],
    rating: 4.7
  },
  {
    id: '10',
    name: 'Tháp Eiffel Việt Nam',
    address: 'Đà Lạt',
    moods: ['romantic', 'scenic', 'touristy', 'modern'],
    rating: 4.0
  }
];

// Function to get places by mood
export const getMockPlacesByMood = (mood: string): MockFavoritePlace[] => {
  return mockFavoritePlaces.filter(place =>
    place.moods.includes(mood)
  );
};

// Function to get all unique moods from mock data
export const getMockMoods = (): string[] => {
  const allMoods = mockFavoritePlaces.flatMap(place => place.moods);
  return [...new Set(allMoods)];
};
