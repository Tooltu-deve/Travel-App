import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { SPACING } from '../constants/spacing';
import { COLORS } from '../constants/colors';

type Props = {
  onCreate: (data: { name: string; startDate?: string; notes?: string }) => void;
};

export default function CreateItineraryForm({ onCreate }: Props) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), startDate: startDate.trim(), notes: notes.trim() });
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Tên lộ trình</Text>
      <TextInput placeholder="VD: Cầu Vàng - Bà Nà" value={name} onChangeText={setName} style={styles.input} />

      <Text style={styles.label}>Ngày khởi hành (tùy chọn)</Text>
      <TextInput placeholder="YYYY-MM-DD" value={startDate} onChangeText={setStartDate} style={styles.input} />

      <Text style={styles.label}>Ghi chú</Text>
      <TextInput placeholder="Ghi chú ngắn" value={notes} onChangeText={setNotes} style={[styles.input, styles.textArea]} multiline numberOfLines={4} />

      <TouchableOpacity style={styles.submit} onPress={handleSubmit} activeOpacity={0.9} accessibilityRole="button">
        <Text style={styles.submitText}>Tạo lộ trình</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.bgCard, padding: SPACING.md, borderRadius: 10, marginBottom: SPACING.md, color: COLORS.textMain },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submit: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: SPACING.sm },
  submitText: { color: '#fff', fontWeight: '900' },
});
