import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../../constants';

interface ReviewCardProps {
  review: {
    id: string;
    userName: string;
    location: string;
    rating: number;
    comment: string;
    date: string;
  };
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewUserInfo}>
          <View style={styles.avatarPlaceholder}>
            <FontAwesome name="user" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewUserName}>{review.userName}</Text>
            <View style={styles.reviewLocationContainer}>
              <FontAwesome name="map-marker" size={12} color={COLORS.primary} />
              <Text style={styles.reviewLocation}>{review.location}</Text>
            </View>
          </View>
        </View>

        <View style={styles.reviewRating}>
          {[...Array(5)].map((_, i) => (
            <FontAwesome
              key={i}
              name={i < review.rating ? 'star' : 'star-o'}
              size={14}
              color={COLORS.ratingAlt}
            />
          ))}
        </View>
      </View>

      <Text style={styles.reviewComment}>{review.comment}</Text>
      <Text style={styles.reviewDate}>{review.date}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  reviewCard: {
    backgroundColor: COLORS.bgCard,
    padding: SPACING.md,
    borderRadius: 12,
    gap: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  reviewUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },

  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  reviewUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },

  reviewLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    backgroundColor: COLORS.bgLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },

  reviewLocation: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },

  reviewDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },

  reviewRating: {
    flexDirection: 'row',
    gap: 2,
  },

  reviewComment: {
    fontSize: 13,
    lineHeight: 20,
    color: '#555',
  },
});
