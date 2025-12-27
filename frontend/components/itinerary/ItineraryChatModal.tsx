import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { API_BASE_URL } from '../../services/api';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: {
    type: string;
    value: string;
  };
}

interface ItineraryChatModalProps {
  visible: boolean;
  onClose: () => void;
  itineraryData: any; // Full itinerary object
  routeId?: string;
}

// Parse markdown text with inline formatting
const parseMarkdownLine = (text: string) => {
  const parts: any[] = [];
  let remaining = text;
  let lastIndex = 0;

  // Patterns for inline formatting
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, style: 'bold', type: 'text' },
    { regex: /__(.+?)__/g, style: 'bold', type: 'text' },
    { regex: /\*(.+?)\*/g, style: 'italic', type: 'text' },
    { regex: /_(.+?)_/g, style: 'italic', type: 'text' },
    { regex: /`(.+?)`/g, style: 'code', type: 'text' },
  ];

  let result = text;

  // Replace patterns
  result = result.replace(/\*\*(.+?)\*\*/g, '\x01BOLD\x02$1\x01/BOLD\x02');
  result = result.replace(/__(.+?)__/g, '\x01BOLD\x02$1\x01/BOLD\x02');
  result = result.replace(/\*(.+?)\*/g, '\x01ITALIC\x02$1\x01/ITALIC\x02');
  result = result.replace(/_(.+?)_/g, '\x01ITALIC\x02$1\x01/ITALIC\x02');
  result = result.replace(/`(.+?)`/g, '\x01CODE\x02$1\x01/CODE\x02');

  // Split by markers
  const tokens = result.split(/(\x01[A-Z/]+\x02)/);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '\x01BOLD\x02') {
      i++;
      if (i < tokens.length && tokens[i] !== '\x01/BOLD\x02') {
        parts.push({ type: 'bold', text: tokens[i] });
      }
      i++; // skip closing marker
    } else if (token === '\x01ITALIC\x02') {
      i++;
      if (i < tokens.length && tokens[i] !== '\x01/ITALIC\x02') {
        parts.push({ type: 'italic', text: tokens[i] });
      }
      i++;
    } else if (token === '\x01CODE\x02') {
      i++;
      if (i < tokens.length && tokens[i] !== '\x01/CODE\x02') {
        parts.push({ type: 'code', text: tokens[i] });
      }
      i++;
    } else if (token && !token.startsWith('\x01')) {
      parts.push({ type: 'text', text: token });
    }
  }

  return parts;
};

// Simple markdown text renderer
const RenderMarkdownText = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  
  return (
    <View>
      {lines.map((line, lineIndex) => {
        // Heading 1: # Text
        if (line.startsWith('# ')) {
          return (
            <Text key={lineIndex} style={styles.heading1}>
              {line.substring(2)}
            </Text>
          );
        }
        
        // Heading 2: ## Text
        if (line.startsWith('## ')) {
          return (
            <Text key={lineIndex} style={styles.heading2}>
              {line.substring(3)}
            </Text>
          );
        }
        
        // Heading 3: ### Text
        if (line.startsWith('### ')) {
          return (
            <Text key={lineIndex} style={styles.heading3}>
              {line.substring(4)}
            </Text>
          );
        }
        
        // Unordered list: - Item
        if (line.startsWith('- ')) {
          const parts = parseMarkdownLine(line.substring(2));
          return (
            <View key={lineIndex} style={styles.listItem}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.messageTextContent}>
                {parts.map((part, i) => {
                  if (part.type === 'bold') return <Text key={i} style={styles.boldText}>{part.text}</Text>;
                  if (part.type === 'italic') return <Text key={i} style={styles.italicText}>{part.text}</Text>;
                  if (part.type === 'code') return <Text key={i} style={styles.codeInlineText}>{part.text}</Text>;
                  return <Text key={i}>{part.text}</Text>;
                })}
              </Text>
            </View>
          );
        }
        
        // Ordered list: 1. Item
        const orderedMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (orderedMatch) {
          const [, number, content] = orderedMatch;
          const parts = parseMarkdownLine(content);
          return (
            <View key={lineIndex} style={styles.listItem}>
              <Text style={styles.listNumber}>{number}.</Text>
              <Text style={styles.messageTextContent}>
                {parts.map((part, i) => {
                  if (part.type === 'bold') return <Text key={i} style={styles.boldText}>{part.text}</Text>;
                  if (part.type === 'italic') return <Text key={i} style={styles.italicText}>{part.text}</Text>;
                  if (part.type === 'code') return <Text key={i} style={styles.codeInlineText}>{part.text}</Text>;
                  return <Text key={i}>{part.text}</Text>;
                })}
              </Text>
            </View>
          );
        }
        
        // Empty line
        if (line.trim() === '') {
          return <View key={lineIndex} style={{ height: 8 }} />;
        }
        
        // Normal text with inline formatting
        const parts = parseMarkdownLine(line);
        return (
          <Text key={lineIndex} style={styles.messageTextContent}>
            {parts.map((part, i) => {
              if (part.type === 'bold') return <Text key={i} style={styles.boldText}>{part.text}</Text>;
              if (part.type === 'italic') return <Text key={i} style={styles.italicText}>{part.text}</Text>;
              if (part.type === 'code') return <Text key={i} style={styles.codeInlineText}>{part.text}</Text>;
              return <Text key={i}>{part.text}</Text>;
            })}
            {'\n'}
          </Text>
        );
      })}
    </View>
  );
};

export const ItineraryChatModal: React.FC<ItineraryChatModalProps> = ({ 
  visible, 
  onClose, 
  itineraryData,
  routeId 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    if (visible && messages.length === 0) {
      // Add welcome message when modal opens
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '👋 Xin chào! Tôi là trợ lý AI của bạn.\n\nTôi có thể giúp bạn:\n- 📋 Xem chi tiết lộ trình\n- 🏛️ Giới thiệu các địa điểm trong lộ trình\n- 💡 Gợi ý thêm địa điểm phù hợp\n- 📅 Tư vấn về lịch trình\n\nHãy hỏi tôi bất cứ điều gì về lộ trình của bạn!',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [visible]);

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

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
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Vui lòng đăng nhập để sử dụng chatbot');
        return;
      }

      console.log('[ItineraryChat] Sending message with itinerary context');
      console.log('[ItineraryChat] Itinerary data keys:', Object.keys(itineraryData || {}));
      console.log('[ItineraryChat] Has route_data_json:', !!(itineraryData as any)?.route_data_json);
      console.log('[ItineraryChat] Has optimized_route:', !!(itineraryData as any)?.route_data_json?.optimized_route);
      console.log('[ItineraryChat] Optimized route length:', (itineraryData as any)?.route_data_json?.optimized_route?.length || 0);
      
      // Debug: Log first day activities
      const firstDay = (itineraryData as any)?.route_data_json?.optimized_route?.[0];
      if (firstDay) {
        console.log('[ItineraryChat] First day:', firstDay.day);
        console.log('[ItineraryChat] First day activities:', firstDay.activities?.length || 0);
        if (firstDay.activities?.[0]) {
          console.log('[ItineraryChat] First activity name:', firstDay.activities[0].name);
        }
      }

      const requestBody: any = {
        message,
        context: {
          itinerary: itineraryData, // Pass full itinerary object
        }
      };

      if (routeId) {
        requestBody.context.routeId = routeId;
      }

      console.log('[ItineraryChat] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${API_BASE_URL}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        Alert.alert('Lỗi', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ItineraryChat] Response:', data);

      let resp: any = data.response ?? data.result ?? data.output ?? '';
      if (Array.isArray(resp)) {
        resp = resp.map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
      } else if (resp && typeof resp === 'object') {
        resp = resp.text ?? resp.message ?? JSON.stringify(resp);
      }
      if (resp === null || resp === undefined || resp === '') {
        resp = 'Không có phản hồi từ server';
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: String(resp),
        timestamp: new Date(),
        action: data.metadata?.action,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('[ItineraryChat] Error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể kết nối với AI assistant');
      
      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (content: string) => {
    Clipboard.setString(content);
    Alert.alert('Đã sao chép', 'Tin nhắn đã được sao chép vào clipboard');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const suggestedQuestions = [
    '📋 Xem lộ trình của tôi',
    '🏛️ Giới thiệu địa điểm đầu tiên',
    '💡 Gợi ý thêm địa điểm',
    '📅 Xem lịch trình ngày 1',
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={[COLORS.gradientBlue1, COLORS.gradientBlue2]}
        style={styles.gradientBackground}
      >
        <View style={styles.container}>
          {/* Header */}
          <LinearGradient
            colors={[COLORS.primary + '15', COLORS.bgMain]}
            style={styles.header}
          >
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
                </View>
              </TouchableOpacity>

              <View style={styles.headerTitleContainer}>
                <View style={styles.aiIconContainer}>
                  <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.primary]}
                    style={styles.aiIconGradient}
                  >
                    <MaterialCommunityIcons name="robot" size={28} color={COLORS.textWhite} />
                  </LinearGradient>
                </View>
                <View style={styles.headerTitleBox}>
                  <Text style={styles.headerTitle}>AI Lộ trình</Text>
                  <Text style={styles.headerSubtitle}>Trợ lý thông minh</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const isAtBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 50;
              setShowScrollButton(!isAtBottom && messages.length > 3);
            }}
            scrollEventThrottle={400}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyContent}>
                  <View style={styles.emptyIconWrap}>
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.gradientSecondary]}
                      style={styles.emptyIconContainer}
                    >
                      <MaterialCommunityIcons name="robot-happy" size={60} color={COLORS.textWhite} />
                    </LinearGradient>
                  </View>
                  <Text style={styles.emptyTitle}>Chào mừng đến với AI Lộ trình!</Text>
                  <Text style={styles.emptySubtitle}>
                    Tôi có thể giúp bạn tìm hiểu về lộ trình, gợi ý địa điểm, và trả lời các câu hỏi của bạn.
                  </Text>

                  {/* Suggested questions */}
                  <View style={styles.suggestionContainer}>
                    <View style={styles.suggestionHeader}>
                      <MaterialCommunityIcons name="lightbulb-on" size={18} color={COLORS.primary} />
                      <Text style={styles.suggestionTitle}>Câu hỏi gợi ý</Text>
                    </View>
                    {suggestedQuestions.map((question, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionChip}
                        onPress={() => sendMessage(question)}
                        disabled={isLoading}
                      >
                        <LinearGradient
                          colors={[COLORS.bgMain, COLORS.bgSecondary]}
                          style={styles.suggestionChipGradient}
                        >
                          <Text style={styles.suggestionText}>{question}</Text>
                          <MaterialIcons name="arrow-forward" size={16} color={COLORS.primary} />
                        </LinearGradient>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.messageWrapper,
                    msg.role === 'user' ? styles.userMessageWrapper : styles.assistantMessageWrapper,
                  ]}
                >
                  {msg.role === 'assistant' ? (
                    <LinearGradient
                      colors={[COLORS.gradientBlue1, COLORS.bgMain]}
                      style={[styles.messageContainer, styles.assistantMessage]}
                    >
                      <View style={styles.messageHeader}>
                        <View style={[styles.avatarContainer, styles.assistantAvatar]}>
                          <MaterialCommunityIcons name="robot" size={16} color={COLORS.textWhite} />
                        </View>
                        <Text style={[styles.roleName, styles.assistantRoleName]}>
                          AI Assistant
                        </Text>
                        <Text style={styles.timestamp}>{formatTime(msg.timestamp)}</Text>
                      </View>

                      <View style={styles.messageContent}>
                        <RenderMarkdownText text={msg.content} />
                      </View>

                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={() => handleCopyMessage(msg.content)}
                      >
                        <MaterialIcons name="content-copy" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.copyButtonText}>Sao chép</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.messageContainer, styles.userMessage]}>
                      <View style={styles.messageHeader}>
                        <View style={[styles.avatarContainer, styles.userAvatar]}>
                          <MaterialIcons name="person" size={16} color={COLORS.textWhite} />
                        </View>
                        <Text style={[styles.roleName, styles.userRoleName]}>
                          Bạn
                        </Text>
                        <Text style={styles.timestamp}>{formatTime(msg.timestamp)}</Text>
                      </View>

                      <View style={styles.messageContent}>
                        <RenderMarkdownText text={msg.content} />
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}

            {isLoading && (
              <View style={styles.loadingContainer}>
                <LinearGradient
                  colors={[COLORS.bgMain, COLORS.bgSecondary]}
                  style={styles.loadingContent}
                >
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>AI đang suy nghĩ...</Text>
                </LinearGradient>
              </View>
            )}
          </ScrollView>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <View style={styles.scrollButtonContainer}>
              <TouchableOpacity style={styles.scrollButton} onPress={scrollToBottom}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.gradientSecondary]}
                  style={styles.scrollButtonGradient}
                >
                  <MaterialIcons name="keyboard-arrow-down" size={24} color={COLORS.textWhite} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <LinearGradient
            colors={[COLORS.gradientBlue1, COLORS.bgMain]}
            style={styles.inputContainer}
          >
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="Hỏi về lộ trình của bạn..."
                placeholderTextColor={COLORS.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
                onPress={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isLoading}
              >
                <LinearGradient
                  colors={
                    !inputText.trim() || isLoading
                      ? [COLORS.bgLight, COLORS.bgLight]
                      : [COLORS.primary, COLORS.gradientSecondary]
                  }
                  style={styles.sendButtonGradient}
                >
                  <MaterialIcons name="send" size={24} color={COLORS.textWhite} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </LinearGradient>
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
});
