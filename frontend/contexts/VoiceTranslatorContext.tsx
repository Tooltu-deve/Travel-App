import React, { createContext, useContext, useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import axios from 'axios';

// Import Voice with error handling
let Voice: any = null;
const isExpoGo = process.env.EXPO_PUBLIC_ENV === 'expo-go' || !process.env.EAS_BUILD;

try {
    const VoiceModule = require('@react-native-voice/voice').default;
    Voice = VoiceModule;
} catch (e) {
    console.warn('[VoiceTranslator] Voice module not available - will use fallback for STT');
}

interface VoiceTranslatorContextType {
    // States
    isRecording: boolean;
    recognizedText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    isProcessing: boolean;
    error: string | null;
    isVoiceAvailable: boolean;

    // Actions
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    translateText: (text: string, autoSpeak?: boolean) => Promise<void>;
    speakTranslation: (text?: string) => void;
    swapLanguages: () => void;
    setSourceLang: (lang: string) => void;
    setTargetLang: (lang: string) => void;
    clearTexts: () => void;
}

const VoiceTranslatorContext = createContext<VoiceTranslatorContextType | undefined>(undefined);

export const useVoiceTranslator = () => {
    const context = useContext(VoiceTranslatorContext);
    if (!context) {
        throw new Error('useVoiceTranslator must be used within VoiceTranslatorProvider');
    }
    return context;
};

interface VoiceTranslatorProviderProps {
    children: React.ReactNode;
}

export const VoiceTranslatorProvider: React.FC<VoiceTranslatorProviderProps> = ({ children }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recognizedText, setRecognizedText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [sourceLang, setSourceLang] = useState('vi');
    const [targetLang, setTargetLang] = useState('en');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVoiceAvailable] = useState(!!Voice);

    useEffect(() => {
        // Setup Voice recognition - only if module is available
        if (!Voice) {
            console.warn('Voice module not available, skipping Voice setup');
            return;
        }

        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechResults = onSpeechResults;
        Voice.onSpeechError = onSpeechError;

        return () => {
            try {
                Voice.destroy().then(Voice.removeAllListeners);
            } catch (e) {
                console.warn('Error destroying Voice:', e);
            }
        };
    }, []);

    const onSpeechStart = () => {
        setError(null);
    };

    const onSpeechEnd = () => {
        setIsRecording(false);
    };

    const onSpeechResults = (event: any) => {
        if (event.value && event.value[0]) {
            const text = event.value[0];
            setRecognizedText(text);
            // Auto-speak enabled for voice recording
            translateText(text, true);
        }
    };

    const onSpeechError = (event: any) => {
        setIsRecording(false);
        setError(event.error?.message || 'Lỗi nhận dạng giọng nói');
    };

    const startRecording = async () => {
        try {
            setError(null);
            setRecognizedText('');
            setTranslatedText('');

            // Check if Voice module is available
            if (!Voice) {
                // Fallback for Expo Go - manual text input available in UI
                return;
            }

            // Request microphone permission
            const permission = await Audio.requestPermissionsAsync();
            if (!permission.granted) {
                setError('Cần cấp quyền microphone để sử dụng tính năng này');
                return;
            }

            // Determine locale for Voice recognition
            const locale = sourceLang === 'vi' ? 'vi-VN' :
                sourceLang === 'en' ? 'en-US' :
                    sourceLang === 'ja' ? 'ja-JP' :
                        sourceLang === 'ko' ? 'ko-KR' :
                            sourceLang === 'zh' ? 'zh-CN' : 'vi-VN';

            await Voice.start(locale);
            setIsRecording(true);
        } catch (err) {
            console.error('Start recording error:', err);
            setError('Không thể bắt đầu ghi âm');
            setIsRecording(false);
        }
    };

    const stopRecording = async () => {
        try {
            if (!Voice) {
                setError('Voice module not available');
                return;
            }
            await Voice.stop();
            setIsRecording(false);
        } catch (err) {
            console.error('Stop recording error:', err);
            setError('Không thể dừng ghi âm');
            setIsRecording(false);
        }
    };

    const translateText = async (text: string, autoSpeak: boolean = false) => {
        if (!text.trim()) {
            setError('Không có văn bản để dịch');
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            // Using Google Cloud Translate API v2
            const apiKey = process.env.EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY || 'AIzaSyCiXfPc2mv1k9GvLsEZAzRcwynM331FtUk';

            const response = await axios.post(
                `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
                {
                    q: text,
                    target: targetLang,
                }
            );

            if (response.data?.data?.translations?.[0]?.translatedText) {
                const translatedResult = response.data.data.translations[0].translatedText;
                setTranslatedText(translatedResult);
                // Auto-speak only if requested (from voice recording)
                if (autoSpeak) {
                    speakTranslation(translatedResult);
                }
            } else {
                throw new Error('Không nhận được kết quả dịch');
            }
        } catch (err: any) {
            console.error('Translation error:', err);

            // Handle specific Google API errors
            if (err.response?.data?.error?.message?.includes('Invalid Value')) {
                setError('Mã ngôn ngữ không hợp lệ. Vui lòng kiểm tra lại.');
            } else if (err.response?.data?.error?.message?.includes('PERMISSION_DENIED')) {
                setError('Khóa API không hợp lệ. Vui lòng kiểm tra cấu hình.');
            } else {
                setError(err.response?.data?.error?.message || 'Không thể dịch văn bản. Vui lòng thử lại.');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const speakTranslation = async (text?: string) => {
        const textToSpeak = text || translatedText;
        if (!textToSpeak.trim()) {
            return;
        }

        // Stop any ongoing speech first
        try {
            await Speech.stop();
        } catch (e) {
            console.warn('Error stopping speech:', e);
        }

        // Determine voice locale
        const voiceLocale = targetLang === 'vi' ? 'vi-VN' :
            targetLang === 'en' ? 'en-US' :
                targetLang === 'ja' ? 'ja-JP' :
                    targetLang === 'ko' ? 'ko-KR' :
                        targetLang === 'zh' ? 'zh-CN' : 'en-US';

        const options = {
            language: voiceLocale,
            pitch: 1.0,
            rate: 0.85,
        };

        Speech.speak(textToSpeak, options);
    };

    const swapLanguages = () => {
        const temp = sourceLang;
        setSourceLang(targetLang);
        setTargetLang(temp);

        // Swap texts as well
        const tempText = recognizedText;
        setRecognizedText(translatedText);
        setTranslatedText(tempText);
    };

    const clearTexts = () => {
        setRecognizedText('');
        setTranslatedText('');
        setError(null);
    };

    const value: VoiceTranslatorContextType = {
        isRecording,
        recognizedText,
        translatedText,
        sourceLang,
        targetLang,
        isProcessing,
        error,
        startRecording,
        stopRecording,
        translateText,
        speakTranslation,
        swapLanguages,
        setSourceLang,
        setTargetLang,
        clearTexts,
        isVoiceAvailable,
    };

    return (
        <VoiceTranslatorContext.Provider value={value}>
            {children}
        </VoiceTranslatorContext.Provider>
    );
};
