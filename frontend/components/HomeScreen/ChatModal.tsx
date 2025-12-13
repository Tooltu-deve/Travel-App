import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  Clipboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../services/api';
import ItineraryDetailScreen from './ItineraryDetailScreen';
import useLocation from '../../hooks/useLocation';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
}

// Parse markdown text with inline formatting
const parseMarkdownLine = (text: string) => {
  const parts: any[] = [];
  let remaining = text;
  let lastIndex = 0;

  // Patterns for inline formatting
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, style: 'bold', type: 'text' }, // **bold**
    { regex: /__(.+?)__/g, style: 'bold', type: 'text' }, // __bold__
    { regex: /\*(.+?)\*/g, style: 'italic', type: 'text' }, // *italic*
    { regex: /_(.+?)_/g, style: 'italic', type: 'text' }, // _italic_
    { regex: /`(.+?)`/g, style: 'code', type: 'text' }, // `code`
  ];

  let result = text;

  // Replace patterns
  result = result.replace(/\*\*(.+?)\*\*/g, '\x01BOLD\x02$1\x01/BOLD\x02');
  result = result.replace(/__(.+?)__/g, '\x01BOLD\x02$1\x01/BOLD\x02');
  result = result.replace(/\*(.+?)\*/g, '\x01ITALIC\x02$1\x01/ITALIC\x02');
  result = result.replace(/_(.+?)_/g, '\x01ITALIC\x02$1\x01/ITALIC\x02');
  result = result.replace(/`(.+?)`/g, '\x01CODE\x02$1\x01/CODE\x02');

  // Split by markers
  const tokens = result.split(/(\x01BOLD\x02|\x01\/BOLD\x02|\x01ITALIC\x02|\x01\/ITALIC\x02|\x01CODE\x02|\x01\/CODE\x02)/);

  let currentStyle: 'normal' | 'bold' | 'italic' | 'code' = 'normal';

  tokens.forEach((token) => {
    if (token === '\x01BOLD\x02') {
      currentStyle = 'bold';
    } else if (token === '\x01/BOLD\x02') {
      currentStyle = 'normal';
    } else if (token === '\x01ITALIC\x02') {
      currentStyle = 'italic';
    } else if (token === '\x01/ITALIC\x02') {
      currentStyle = 'normal';
    } else if (token === '\x01CODE\x02') {
      currentStyle = 'code';
    } else if (token === '\x01/CODE\x02') {
      currentStyle = 'normal';
    } else if (token) {
      let textStyle = styles.messageTextContent;
      if (currentStyle === 'bold') {
        textStyle = styles.boldText;
      } else if (currentStyle === 'italic') {
        textStyle = styles.italicText;
      } else if (currentStyle === 'code') {
        textStyle = styles.codeInlineText;
      }

      parts.push(
        <Text key={`part-${parts.length}`} style={textStyle}>
          {token}
        </Text>
      );
    }
  });

  return parts.length > 0 ? parts : text;
};

// Simple markdown text renderer
const RenderMarkdownText = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  const elements: any[] = [];

  lines.forEach((line, lineIndex) => {
    if (!line.trim()) {
      elements.push(<View key={`line-${lineIndex}`} style={{ height: 8 }} />);
      return;
    }

    // Check for list items
    if (/^\s*[-*•]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*•]\s+/, '').trim();
      elements.push(
        <View key={`item-${lineIndex}`} style={styles.listItem}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.messageTextContent}>
            {parseMarkdownLine(content)}
          </Text>
        </View>
      );
      return;
    }

    // Check for numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const match = line.match(/^\s*(\d+)\.\s+/);
      const number = match?.[1];
      const content = line.replace(/^\s*\d+\.\s+/, '').trim();
      elements.push(
        <View key={`num-item-${lineIndex}`} style={styles.listItem}>
          <Text style={styles.listNumber}>{number}.</Text>
          <Text style={styles.messageTextContent}>
            {parseMarkdownLine(content)}
          </Text>
        </View>
      );
      return;
    }

    // Check for headings
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const content = line.replace(/^#+\s+/, '');
      const headingStyle = level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3;
      elements.push(
        <Text key={`heading-${lineIndex}`} style={headingStyle}>
          {parseMarkdownLine(content)}
        </Text>
      );
      return;
    }

    // Regular text
    elements.push(
      <Text key={`text-${lineIndex}`} style={styles.messageTextContent}>
        {parseMarkdownLine(line)}
      </Text>
    );
  });

  return <View>{elements}</View>;
};

export const ChatModal: React.FC<ChatModalProps> = ({ visible, onClose }) => {
  const { token, signOut, userData } = useAuth() as any;
  const { location, requestLocation, loading: locationLoading, error: locationError } = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [itineraryId, setItineraryId] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<any>(null);
  const [itineraryStatus, setItineraryStatus] = useState<'DRAFT' | 'CONFIRMED' | null>(null);
  const [startLocation, setStartLocation] = useState<string | { lat: number; lng: number } | undefined>(undefined);
  const [showItineraryDetail, setShowItineraryDetail] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(0)).current;

  const MAX_CHAT_RETRIES = 2;
  const RETRY_BASE_DELAY_MS = 1000;

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  useEffect(() => {
    Animated.timing(buttonScale, {
      toValue: showScrollButton ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollButton]);

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const contentHeight = event.nativeEvent.contentSize.height;
        const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

        const isNearBottom = contentHeight - offsetY - scrollViewHeight < 100;
        setShowScrollButton(!isNearBottom && messages.length > 0);
      },
    }
  );

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert('Đã sao chép', 'Nội dung đã được sao chép vào clipboard');
  };

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;
    if (!token) {
      Alert.alert('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để sử dụng chatbot.');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      let attempt = 0;
      let lastError: any = null;

      while (attempt <= MAX_CHAT_RETRIES) {
        try {
          const requestBody: any = { message, sessionId };

          // Start location is now handled through chat messages, not input field
          // Agent will ask user for start location in conversation

          console.debug('Sending chat request', requestBody);
          const response = await fetch(`${API_BASE_URL}/api/v1/ai/chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          // Unauthorized -> immediate sign out
          if (response.status === 401) {
            signOut();
            return;
          }

          // Try to parse body if present
          let data: any = null;
          try {
            data = await response.json();
            console.debug('Chat response (parsed):', data);
          } catch (err) {
            console.debug('Chat response parse error', err);
            // ignore
          }

          // If service unavailable, consider retrying
          if (!response.ok) {
            if (response.status === 503) {
              lastError = { code: 503, message: 'Service Unavailable' };
              // retry if attempts remain
              if (attempt < MAX_CHAT_RETRIES) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Chat request returned 503, retrying in ${delay}ms (attempt ${attempt + 1})`);
                await sleep(delay);
                attempt++;
                continue;
              }
              // no attempts left
              Alert.alert('Dịch vụ tạm thời không khả dụng', 'AI server đang bận. Vui lòng thử lại sau vài phút.');
              return;
            }

            // Handle 408 Timeout error
            if (response.status === 408) {
              const timeoutMsg = data?.message || 'Yêu cầu quá lâu';
              const timeoutText = String(timeoutMsg);
              console.warn(`Chat request timeout (408): ${timeoutText}`);
              Alert.alert(
                'Yêu cầu quá lâu',
                timeoutText + '\n\nVui lòng thử lại với tin nhắn ngắn hơn hoặc đợi một lúc rồi thử lại.',
                [{ text: 'OK', onPress: () => { } }]
              );
              return;
            }

            const errMsg = data?.message || `Server returned ${response.status}`;
            console.error('Chat error response:', response.status, data);
            Alert.alert('Lỗi', String(errMsg));
            return;
          }

          const dataOk = data || {};

          // Always update sessionId if provided by server
          if (dataOk.sessionId) {
            setSessionId(dataOk.sessionId);
          }

          // Coerce response into a safe string. Backend may return array/object.
          let resp: any = dataOk.response ?? dataOk.result ?? dataOk.output ?? '';
          if (Array.isArray(resp)) {
            // join array elements into readable text
            resp = resp.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
          } else if (resp && typeof resp === 'object') {
            // try to find a 'text' field, otherwise stringify
            resp = resp.text ?? resp.message ?? JSON.stringify(resp);
          }
          if (resp === null || resp === undefined || resp === '') {
            resp = 'Không có phản hồi từ server';
          }

          // Track itinerary from response
          const newItineraryId = dataOk.itineraryId || dataOk.metadata?.itinerary_id || dataOk.itinerary_id;
          const isNewItinerary = newItineraryId && newItineraryId !== itineraryId;

          if (newItineraryId) {
            if (isNewItinerary) {
              console.debug('[Chat Response] NEW itinerary detected:', newItineraryId);
              setItineraryId(newItineraryId);
              setItineraryStatus('DRAFT'); // Always DRAFT for new itinerary
            } else {
              console.debug('[Chat Response] Same itinerary:', newItineraryId);
              setItineraryId(newItineraryId);
            }
          }

          if (dataOk.itinerary && Array.isArray(dataOk.itinerary)) {
            console.debug('[Chat Response] Setting itinerary with', dataOk.itinerary.length, 'items');

            // DEBUG: Log first item structure to see if encoded_polyline exists
            if (dataOk.itinerary.length > 0) {
              console.log('[DEBUG] First itinerary item structure:', JSON.stringify(dataOk.itinerary[0], null, 2));
            }

            // Transform itinerary to match ItineraryItem interface
            const transformedItinerary = dataOk.itinerary.map((item: any, index: number) => {
              // Extract day from item or use calculated day
              const day = item.day || Math.floor(index / 3) + 1;

              return {
                day,
                time: item.time || item.estimated_arrival || item.arrival_time || '09:00',
                activity: item.activity || item.name || 'Hoạt động',
                place: {
                  name: item.place?.name || item.name || 'Địa điểm',
                  address: item.place?.address || item.address,
                  googlePlaceId: item.place?.googlePlaceId || item.google_place_id || item.googlePlaceId,
                  location: item.place?.location || (item.location && {
                    lat: typeof item.location.lat === 'number' ? item.location.lat : item.location[1],
                    lng: typeof item.location.lng === 'number' ? item.location.lng : item.location[0],
                  }),
                  rating: item.place?.rating || item.rating,
                },
                duration_minutes: item.duration_minutes || item.duration || 90,
                notes: item.notes,
                encoded_polyline: item.encoded_polyline || item.start_encoded_polyline,
                start_location_polyline: item.start_location_polyline,
                travel_duration_minutes: item.travel_duration_minutes || item.start_travel_duration_minutes,
                travel_duration_from_start: item.travel_duration_from_start,
                type: item.type,
                ecs_score: item.ecs_score,
              };
            });

            console.debug('[Chat Response] Transformed itinerary:', transformedItinerary);

            // If start_location exists and first item doesn't have start_location_polyline, fetch it
            if (dataOk.start_location && transformedItinerary.length > 0 && !transformedItinerary[0].start_location_polyline) {
              console.log('[Chat Response] Fetching start_location_polyline from Google Directions API...');
              const apiKey = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
              if (apiKey && transformedItinerary[0].place?.location) {
                const firstActivityLoc = transformedItinerary[0].place.location;
                const startLoc = dataOk.start_location;
                const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLoc.lat},${startLoc.lng}&destination=${firstActivityLoc.lat},${firstActivityLoc.lng}&mode=driving&key=${apiKey}`;

                fetch(directionsUrl)
                  .then(res => res.json())
                  .then(data => {
                    if (data.routes && data.routes[0]) {
                      const polyline = data.routes[0].overview_polyline?.points;
                      const duration = data.routes[0].legs?.[0]?.duration?.value || 0;
                      if (polyline) {
                        console.log('[Chat Response] ✅ start_location_polyline fetched!');
                        transformedItinerary[0].start_location_polyline = polyline;
                        transformedItinerary[0].travel_duration_from_start = Math.round(duration / 60);
                        setItinerary([...transformedItinerary]); // Force re-render
                      }
                    }
                  })
                  .catch(err => console.warn('[Chat Response] Failed to fetch start_location_polyline:', err));
              }
            }

            // Log for debugging - check if polylines exist
            const hasPolylines = transformedItinerary.some((item: any) => item.encoded_polyline);
            const hasStartLocationPolylines = transformedItinerary.some((item: any) => item.start_location_polyline);
            console.debug('[Chat Response] Has polylines:', hasPolylines);
            console.debug('[Chat Response] Has start_location_polylines:', hasStartLocationPolylines);
            if (!hasPolylines) {
              console.warn('[Chat Response] ⚠️  No encoded_polyline found in itinerary data');
            }
            if (hasStartLocationPolylines) {
              console.log('[Chat Response] ✅ START LOCATION POLYLINE found!');
              const itemWithStartPolyline = transformedItinerary.find((item: any) => item.start_location_polyline);
              console.log('[Chat Response] First item with start_location_polyline:', {
                place: itemWithStartPolyline?.place?.name,
                start_location_polyline_length: itemWithStartPolyline?.start_location_polyline?.length,
                travel_duration_from_start: itemWithStartPolyline?.travel_duration_from_start,
              });
            }

            setItinerary(transformedItinerary);
          }

          // Capture start_location from response
          if (dataOk.start_location) {
            console.debug('[Chat Response] Setting start location:', dataOk.start_location);
            setStartLocation(dataOk.start_location);
          }

          if (dataOk.stage) {
            console.debug('[Chat Response] Stage:', dataOk.stage, '. ItineraryId:', dataOk.itineraryId || dataOk.metadata?.itinerary_id);
          }

          console.debug('[Chat Response] Full response object keys:', Object.keys(dataOk));
          console.debug('[Chat Response] Final itineraryId state:', itineraryId);

          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: String(resp),
            timestamp: new Date(),
          };

          setMessages(prev => [...prev, assistantMessage]);
          lastError = null;
          break; // success
        } catch (err: any) {
          // Network-level error (fetch failed). Retry if attempts remain.
          lastError = err;
          const shouldRetry = attempt < MAX_CHAT_RETRIES;
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`Chat request network error: ${err?.message || err}. ${shouldRetry ? `Retrying in ${delay}ms` : 'No more retries'}`);
          if (shouldRetry) {
            await sleep(delay);
            attempt++;
            continue;
          }
          // no retries left -> show error
          break;
        }
      }

      if (lastError) {
        console.error('Chat final error after retries:', lastError);
        Alert.alert('Lỗi kết nối', 'Không thể liên lạc với server AI. Vui lòng thử lại sau.');
      }
    } catch (error: any) {
      console.error('Unexpected chat error:', error);
      Alert.alert('Lỗi', 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetConversation = async () => {
    Alert.alert(
      'Xóa cuộc trò chuyện',
      'Bạn có chắc muốn xóa tất cả các tin nhắn trong cuộc trò chuyện này?',
      [
        {
          text: 'Hủy',
          onPress: () => { },
          style: 'cancel',
        },
        {
          text: 'Xóa',
          onPress: async () => {
            setIsLoading(true);
            try {
              // Get userId from userData (_id or id field)
              const userId = (userData as any)?._id || userData?.id || '';

              console.debug('userData:', userData);
              console.debug('userId extracted:', userId);

              const resetBody: any = {
                userId: userId,
              };

              // Add sessionId if available
              if (sessionId) {
                resetBody.sessionId = sessionId;
              }

              console.debug('Sending reset request', resetBody);

              const response = await fetch(`${API_BASE_URL}/api/v1/ai/reset`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(resetBody),
              });

              if (response.status === 401) {
                signOut();
                return;
              }

              if (response.ok) {
                setMessages([]);
                setSessionId(null);
                setItineraryId(null);
                setItinerary(null);
                setStartLocation(undefined);
                setShowItineraryDetail(false);
                Alert.alert('Thành công', 'Cuộc trò chuyện đã được xóa');
              } else {
                const data = await response.json().catch(() => ({}));
                const errMsg = data?.message || `Lỗi: ${response.status}`;
                console.error('Reset error response:', response.status, data);
                Alert.alert('Lỗi', String(errMsg));
              }
            } catch (error: any) {
              if (error?.message?.includes('401') || error?.status === 401) {
                signOut();
                return;
              }
              console.error('Reset error:', error);
              Alert.alert('Lỗi', 'Không thể xóa cuộc trò chuyện. Vui lòng thử lại.');
            } finally {
              setIsLoading(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageWrapper,
      item.role === 'user' ? styles.userMessageWrapper : styles.assistantMessageWrapper
    ]}>
      <View style={[
        styles.messageContainer,
        item.role === 'user' ? styles.userMessage : styles.assistantMessage
      ]}>
        <View style={styles.messageHeader}>
          <View style={[
            styles.avatarContainer,
            item.role === 'user' ? styles.userAvatar : styles.assistantAvatar
          ]}>
            <MaterialCommunityIcons
              name={item.role === 'user' ? 'account' : 'robot-happy-outline'}
              size={18}
              color={COLORS.textWhite}
            />
          </View>
          <Text style={[
            styles.roleName,
            item.role === 'user' ? styles.userRoleName : styles.assistantRoleName
          ]}>
            {item.role === 'user' ? 'Bạn' : 'AI Travel Assistant'}
          </Text>
          <Text style={styles.timestamp}>
            {item.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.messageContent}>
          {item.role === 'assistant' ? (
            <RenderMarkdownText text={item.content} />
          ) : (
            <Text style={styles.messageText}>
              {item.content}
            </Text>
          )}
        </View>

        {/* Copy button for assistant messages */}
        {item.role === 'assistant' && (
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => copyToClipboard(item.content)}
          >
            <MaterialCommunityIcons name="content-copy" size={14} color={COLORS.textSecondary} />
            <Text style={styles.copyButtonText}>Sao chép</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* Itinerary Detail Screen Modal */}
      {showItineraryDetail && itinerary && itineraryId && (
        <ItineraryDetailScreen
          itinerary={itinerary}
          itineraryId={itineraryId}
          startLocation={startLocation}
          itineraryStatus={itineraryStatus}
          setItineraryStatus={setItineraryStatus}
          onClose={() => setShowItineraryDetail(false)}
          onConfirmSuccess={() => {
            // Optional: handle post-confirmation logic
            setShowItineraryDetail(false);
          }}
          onSendMessage={(message) => {
            console.debug('[ItineraryDetailScreen] Sending message:', message);
            sendMessage(message);
            setShowItineraryDetail(false);
          }}
        />
      )}

      {/* Main Chat Modal */}
      {!showItineraryDetail && (
        <LinearGradient
          colors={['#E3F2FD', 'rgba(178, 221, 247, 1)', COLORS.bgMain]}
          style={styles.gradientBackground}
        >
          <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Header with Glassmorphism */}
            <BlurView intensity={90} tint="light" style={styles.header}>
              <View style={styles.headerContent}>
                <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                  <View style={styles.aiIconContainer}>
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.gradientSecondary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.aiIconGradient}
                    >
                      <MaterialCommunityIcons name="robot-happy" size={26} color={COLORS.textWhite} />
                    </LinearGradient>
                  </View>
                  <View style={styles.headerTitleBox}>
                    <Text style={styles.headerTitle}>AI Assistant</Text>
                    <Text style={styles.headerSubtitle}>Du lịch thông minh</Text>
                  </View>
                </View>

                <TouchableOpacity onPress={resetConversation} style={styles.headerButton}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="restart" size={24} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              </View>
            </BlurView>

            {/* Messages List */}
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.emptyScrollContent}
                  >
                    <LinearGradient
                      colors={[COLORS.primary + '15', COLORS.gradientSecondary + '15']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.emptyBackgroundGradient}
                    >
                      <View style={styles.emptyContent}>
                        {/* Icon with animation-ready styling */}
                        <View style={styles.emptyIconWrap}>
                          <LinearGradient
                            colors={[COLORS.primary, COLORS.gradientSecondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.emptyIconContainer}
                          >
                            <MaterialCommunityIcons name="chat-plus-outline" size={72} color={COLORS.textWhite} />
                          </LinearGradient>
                        </View>

                        {/* Title */}
                        <Text style={styles.emptyTitle}>Chào mừng bạn đến với{'\n'}AI Travel Assistant!</Text>

                        {/* Subtitle */}
                        <Text style={styles.emptySubtitle}>
                          Hãy bắt đầu cuộc trò chuyện bằng cách hỏi tôi về các địa điểm du lịch, lịch trình, hoặc bất kỳ điều gì bạn muốn biết về chuyến đi của mình.
                        </Text>

                        {/* Suggestions */}
                        <View style={styles.suggestionContainer}>
                          <View style={styles.suggestionHeader}>
                            <MaterialCommunityIcons name="lightbulb-on" size={18} color={COLORS.primary} />
                            <Text style={styles.suggestionTitle}>Gợi ý câu hỏi</Text>
                          </View>

                          {[
                            'Gần đây có quán cà phê nào không?',
                            'Tôi muốn đi du lịch ở thành phố hồ chí minh',
                            'Tôi muốn đi du lịch ở thành phố Hồ Chí Minh, 2 người, 3 ngày, ngân sách 7 triệu, náo nhiệt, 227 nguyễn văn cừ',
                            'Gợi ý lộ trình du lịch Đà Nẵng - Hội An, 2 người, 2 ngày, 5 triệu đồng'
                          ].map((suggestion, index) => (
                            <TouchableOpacity
                              key={index}
                              style={styles.suggestionChip}
                              onPress={() => setInputText(suggestion)}
                              activeOpacity={0.7}
                            >
                              <LinearGradient
                                colors={[COLORS.primary + '10', COLORS.gradientSecondary + '10']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.suggestionChipGradient}
                              >
                                <MaterialCommunityIcons name={`numeric-${index + 1}-circle-outline`} size={20} color={COLORS.primary} />
                                <Text style={styles.suggestionText} numberOfLines={2}>{suggestion}</Text>
                                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
                              </LinearGradient>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </LinearGradient>
                  </ScrollView>
                </View>
              }
            />

            {/* Scroll to Bottom Button */}
            {showScrollButton && (
              <Animated.View
                style={[
                  styles.scrollButtonContainer,
                  {
                    transform: [{ scale: buttonScale }],
                    opacity: buttonScale,
                  }
                ]}
              >
                <TouchableOpacity
                  style={styles.scrollButton}
                  onPress={scrollToBottom}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.gradientSecondary]}
                    style={styles.scrollButtonGradient}
                  >
                    <MaterialCommunityIcons name="chevron-down" size={24} color={COLORS.textWhite} />
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <BlurView intensity={60} tint="light" style={styles.loadingContainer}>
                <View style={styles.loadingContent}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>AI đang suy nghĩ...</Text>
                </View>
              </BlurView>
            )}

            {/* Input Container with Glassmorphism */}
            <BlurView intensity={80} tint="light" style={styles.inputContainer}>
              {/* Itinerary Quick View Button */}
              {itinerary && itinerary.length > 0 && (
                <TouchableOpacity
                  style={styles.itineraryQuickButton}
                  onPress={() => {
                    console.debug('[ChatModal] Itinerary button pressed:', {
                      hasItinerary: !!itinerary,
                      itineraryLength: itinerary?.length,
                      itineraryId,
                    });
                    setShowItineraryDetail(true);
                  }}
                >
                  <LinearGradient
                    colors={[COLORS.primary + '25', COLORS.gradientSecondary + '15']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.itineraryQuickButtonGradient}
                  >
                    <View style={styles.itineraryQuickButtonIconWrapper}>
                      <MaterialCommunityIcons name="calendar-check" size={20} color={COLORS.textWhite} />
                    </View>
                    <View style={styles.itineraryQuickButtonText}>
                      <Text style={styles.itineraryQuickButtonTitle}>
                        Lộ trình của bạn
                      </Text>
                      <Text style={styles.itineraryQuickButtonSubtitle}>
                        {itinerary.length} hoạt động • Nhấn để xem chi tiết
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Hỏi AI về kế hoạch du lịch..."
                  placeholderTextColor={COLORS.textSecondary + '70'}
                  multiline
                  maxLength={500}
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!inputText.trim() || isLoading || !token) && styles.sendButtonDisabled]}
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || isLoading || !token}
                >
                  <LinearGradient
                    colors={(!inputText.trim() || isLoading || !token)
                      ? [COLORS.disabled, COLORS.disabled]
                      : [COLORS.primary, COLORS.gradientSecondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendButtonGradient}
                  >
                    <MaterialCommunityIcons
                      name={isLoading ? "loading" : "send"}
                      size={22}
                      color={COLORS.textWhite}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </BlurView>
          </KeyboardAvoidingView>
        </LinearGradient>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerButton: {
    padding: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitleBox: {
    flex: 1,
    justifyContent: 'center',
  },
  aiIconContainer: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  aiIconGradient: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textMain,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageWrapper: {
    marginBottom: 20,
    width: '100%',
  },
  userMessageWrapper: {
    alignItems: 'flex-end',
  },
  assistantMessageWrapper: {
    alignItems: 'flex-start',
  },
  messageContainer: {
    maxWidth: width * 0.82,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    flexShrink: 1,
  },
  userMessage: {
    backgroundColor: COLORS.bgMain,
    borderWidth: 2,
    borderColor: COLORS.primary + '40',
    borderTopRightRadius: 4,
  },
  assistantMessage: {
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderTopLeftRadius: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight + '50',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  userAvatar: {
    backgroundColor: COLORS.primary,
  },
  assistantAvatar: {
    backgroundColor: COLORS.gradientSecondary,
  },
  roleName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.3,
  },
  userRoleName: {
    color: COLORS.primary,
  },
  assistantRoleName: {
    color: COLORS.gradientSecondary,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  messageContent: {
    marginBottom: 8,
    flexShrink: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 24,
    letterSpacing: 0.2,
    color: COLORS.textMain,
    flexWrap: 'wrap',
  },
  messageTextContent: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textMain,
    fontWeight: '400',
    flexWrap: 'wrap',
  },
  boldText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textMain,
    fontWeight: '700',
    flexWrap: 'wrap',
  },
  italicText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textMain,
    fontStyle: 'italic',
    fontWeight: '400',
    flexWrap: 'wrap',
  },
  codeInlineText: {
    fontSize: 14,
    lineHeight: 24,
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: COLORS.bgLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heading1: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 12,
    marginBottom: 8,
    lineHeight: 28,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginTop: 10,
    marginBottom: 6,
    lineHeight: 26,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textMain,
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 24,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    marginLeft: 0,
  },
  listBullet: {
    fontSize: 18,
    lineHeight: 24,
    color: COLORS.primary,
    marginRight: 10,
    marginLeft: 0,
    fontWeight: '600',
  },
  listNumber: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.primary,
    marginRight: 10,
    fontWeight: '600',
    minWidth: 20,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: COLORS.bgLight,
    gap: 4,
  },
  copyButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyBackgroundGradient: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContent: {
    alignItems: 'center',
    width: '100%',
  },
  emptyIconWrap: {
    marginBottom: 32,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyIconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textMain,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
    lineHeight: 32,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textMain,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    fontWeight: '500',
  },
  suggestionContainer: {
    width: '100%',
    marginTop: 12,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'center',
    gap: 8,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    letterSpacing: 0.3,
  },
  suggestionChip: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  suggestionChipGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '40',
    borderRadius: 16,
    gap: 12,
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.textMain,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
  scrollButtonContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 100,
  },
  scrollButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  loadingText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingBottom: 12,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '30',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 13,
    paddingTop: 13,
    maxHeight: 120,
    fontSize: 15,
    color: COLORS.textMain,
    backgroundColor: COLORS.bgMain,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    shadowOpacity: 0.12,
    elevation: 2,
  },
  itineraryQuickButton: {
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  itineraryQuickButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '40',
    borderRadius: 18,
    gap: 12,
  },
  itineraryQuickButtonIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  itineraryQuickButtonText: {
    flex: 1,
  },
  itineraryQuickButtonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  itineraryQuickButtonSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});

export default ChatModal;