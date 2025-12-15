import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceTranslator } from '@/contexts/VoiceTranslatorContext';

const LANGUAGES = [
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
];

interface VoiceTranslatorProps {
    style?: any;
}

export const VoiceTranslator: React.FC<VoiceTranslatorProps> = ({ style }) => {
    const {
        isRecording,
        recognizedText,
        translatedText,
        sourceLang,
        targetLang,
        isProcessing,
        error,
        startRecording,
        stopRecording,
        speakTranslation,
        swapLanguages,
        setSourceLang,
        setTargetLang,
        clearTexts,
        translateText,
        isVoiceAvailable,
    } = useVoiceTranslator();

    const [showSourcePicker, setShowSourcePicker] = React.useState(false);
    const [showTargetPicker, setShowTargetPicker] = React.useState(false);
    const [manualText, setManualText] = React.useState('');

    const getLanguageName = (code: string) => {
        return LANGUAGES.find(lang => lang.code === code)?.name || code;
    };

    const getLanguageFlag = (code: string) => {
        return LANGUAGES.find(lang => lang.code === code)?.flag || '🌐';
    };

    const handleRecordPress = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleManualTranslate = () => {
        if (manualText.trim()) {
            translateText(manualText);
        }
    };

    return (
        <View style={[styles.container, style]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>🎤 Dịch Giọng Nói</Text>
                {(recognizedText || translatedText) && (
                    <TouchableOpacity onPress={clearTexts} style={styles.clearButton}>
                        <Ionicons name="close-circle" size={24} color="#FF3B30" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Language Selection */}
            <View style={styles.languageContainer}>
                <TouchableOpacity
                    style={styles.languageButton}
                    onPress={() => setShowSourcePicker(!showSourcePicker)}
                >
                    <Text style={styles.languageFlag}>{getLanguageFlag(sourceLang)}</Text>
                    <Text style={styles.languageText}>{getLanguageName(sourceLang)}</Text>
                    <Ionicons name="chevron-down" size={16} color="#666" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.swapButton}
                    onPress={swapLanguages}
                    disabled={isRecording || isProcessing}
                >
                    <Ionicons name="swap-horizontal" size={24} color="#007AFF" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.languageButton}
                    onPress={() => setShowTargetPicker(!showTargetPicker)}
                >
                    <Text style={styles.languageFlag}>{getLanguageFlag(targetLang)}</Text>
                    <Text style={styles.languageText}>{getLanguageName(targetLang)}</Text>
                    <Ionicons name="chevron-down" size={16} color="#666" />
                </TouchableOpacity>
            </View>

            {showSourcePicker && (
                <View style={styles.languagePicker}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {LANGUAGES.filter(lang => lang.code !== targetLang).map((lang) => (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageOption,
                                    sourceLang === lang.code && styles.languageOptionSelected,
                                ]}
                                onPress={() => {
                                    setSourceLang(lang.code);
                                    setShowSourcePicker(false);
                                }}
                            >
                                <Text style={styles.languageFlag}>{lang.flag}</Text>
                                <Text style={styles.languageOptionText}>{lang.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {showTargetPicker && (
                <View style={styles.languagePicker}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {LANGUAGES.filter(lang => lang.code !== sourceLang).map((lang) => (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageOption,
                                    targetLang === lang.code && styles.languageOptionSelected,
                                ]}
                                onPress={() => {
                                    setTargetLang(lang.code);
                                    setShowTargetPicker(false);
                                }}
                            >
                                <Text style={styles.languageFlag}>{lang.flag}</Text>
                                <Text style={styles.languageOptionText}>{lang.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={styles.textContainer}>
                {!isVoiceAvailable && (
                    <View style={styles.manualInputBox}>
                        <Text style={styles.manualInputLabel}>📝 Nhập văn bản thủ công:</Text>
                        <TextInput
                            style={styles.manualTextInput}
                            placeholder="Nhập văn bản cần dịch..."
                            placeholderTextColor="#999"
                            value={manualText}
                            onChangeText={setManualText}
                            multiline
                            maxLength={300}
                        />
                        <TouchableOpacity
                            style={[styles.translateButton, manualText.trim() === '' && styles.translateButtonDisabled]}
                            onPress={handleManualTranslate}
                            disabled={manualText.trim() === '' || isProcessing}
                        >
                            <Ionicons name="language" size={20} color="#FFF" />
                            <Text style={styles.translateButtonText}>Dịch</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.textBox}>
                    <Text style={styles.textLabel}>Văn bản gốc:</Text>
                    {recognizedText ? (
                        <Text style={styles.textContent}>{recognizedText}</Text>
                    ) : (
                        <Text style={styles.textPlaceholder}>
                            {isVoiceAvailable ? 'Nhấn nút ghi âm để bắt đầu...' : 'Văn bản đã nhập sẽ hiển thị ở đây...'}
                        </Text>
                    )}
                </View>

                <View style={[styles.textBox, styles.translatedBox]}>
                    <View style={styles.translatedHeader}>
                        <Text style={styles.textLabel}>Bản dịch:</Text>
                        {translatedText && (
                            <TouchableOpacity onPress={() => speakTranslation()} style={styles.speakButton}>
                                <Ionicons name="volume-high" size={20} color="#007AFF" />
                            </TouchableOpacity>
                        )}
                    </View>
                    {isProcessing ? (
                        <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />
                    ) : translatedText ? (
                        <Text style={styles.textContent}>{translatedText}</Text>
                    ) : (
                        <Text style={styles.textPlaceholder}>Kết quả dịch sẽ hiển thị ở đây...</Text>
                    )}
                </View>
            </View>

            {error && (
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={20} color="#FF3B30" />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {isVoiceAvailable && (
                <View style={styles.recordButtonContainer}>
                    <TouchableOpacity
                        style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                        onPress={handleRecordPress}
                        disabled={isProcessing}
                    >
                        {isRecording ? (
                            <>
                                <View style={styles.recordingPulse} />
                                <Ionicons name="stop" size={32} color="#FFF" />
                            </>
                        ) : (
                            <Ionicons name="mic" size={32} color="#FFF" />
                        )}
                    </TouchableOpacity>
                    <Text style={styles.recordButtonLabel}>
                        {isRecording ? 'Nhấn để dừng' : 'Nhấn để ghi âm'}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    clearButton: { padding: 4 },
    languageContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    languageButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F5F5F5',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 12,
        gap: 6,
    },
    languageFlag: { fontSize: 20 },
    languageText: { fontSize: 14, fontWeight: '600', color: '#333' },
    swapButton: { marginHorizontal: 8, padding: 8 },
    languagePicker: { marginBottom: 12 },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginRight: 8,
        gap: 6,
    },
    languageOptionSelected: { backgroundColor: '#007AFF' },
    languageOptionText: { fontSize: 13, color: '#333', fontWeight: '500' },
    textContainer: { gap: 12, marginBottom: 16 },
    textBox: { backgroundColor: '#F9F9F9', borderRadius: 12, padding: 12, minHeight: 80 },
    translatedBox: { backgroundColor: '#E8F4FF' },
    translatedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    textLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8 },
    textContent: { fontSize: 15, color: '#333', lineHeight: 22 },
    textPlaceholder: { fontSize: 14, color: '#999', fontStyle: 'italic' },
    speakButton: { padding: 4 },
    loader: { marginTop: 8 },
    errorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
    errorText: { flex: 1, fontSize: 13, color: '#FF3B30' },
    recordButtonContainer: { alignItems: 'center', gap: 8 },
    recordButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        position: 'relative',
    },
    recordButtonActive: { backgroundColor: '#FF3B30', shadowColor: '#FF3B30' },
    recordingPulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: '#FF3B30', opacity: 0.3 },
    recordButtonLabel: { fontSize: 13, fontWeight: '600', color: '#666' },
    manualInputBox: { backgroundColor: '#FFF9E6', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFB800' },
    manualInputLabel: { fontSize: 12, fontWeight: '600', color: '#FF9500', marginBottom: 8 },
    manualTextInput: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FFB800', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', minHeight: 60, maxHeight: 100, marginBottom: 10 },
    translateButton: { backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
    translateButtonDisabled: { backgroundColor: '#CCCCCC' },
    translateButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
