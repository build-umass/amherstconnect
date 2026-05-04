import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Deal } from '../types/deal';
 
interface Props {
  deal: Deal;
  onClaim: (dealId: string) => void;
}
 
const CATEGORY_EMOJI: Record<string, string> = {
  dining: '🌯',
  coffee: '☕',
  retail: '👕',
  nightlife: '🍺',
};
 
export default function DealCard({ deal, onClaim }: Props) {
  const isExpiringSoon = deal.isExpiringSoon;
  const emoji = CATEGORY_EMOJI[deal.category] ?? '🏷️';
 
  const accentColor = isExpiringSoon ? '#F5A623' : '#8B1A1A';
 
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: accentColor }]}
      activeOpacity={0.88}
    >
      {/* Emoji icon */}
      <View style={[styles.iconWrap, { backgroundColor: isExpiringSoon ? '#FFF8EE' : '#FFF0F0' }]}>
        <Text style={styles.iconEmoji}>{emoji}</Text>
      </View>
 
      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.categoryLabel, { color: accentColor }]}>
            {deal.category.toUpperCase()}
          </Text>
          {isExpiringSoon && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryIcon}>⏰</Text>
              <Text style={styles.expiryText}>Ends tonight</Text>
            </View>
          )}
          {!isExpiringSoon && deal.expiresAt && (
            <Text style={styles.endsText}>Ends {deal.expiresAt}</Text>
          )}
        </View>
        <Text style={styles.offerTitle}>{deal.offerTitle}</Text>
        <Text style={styles.businessName}>{deal.businessName}</Text>
      </View>
 
      {/* Claim button — orange for expiring, red for regular */}
      <TouchableOpacity
        style={[styles.claimButton, { backgroundColor: accentColor }]}
        onPress={() => onClaim(deal.id)}
        activeOpacity={0.75}
      >
        <Text style={styles.claimText}>Claim</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
 
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 13,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 22,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  expiryIcon: {
    fontSize: 10,
  },
  expiryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E53935',
  },
  endsText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 20,
  },
  businessName: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  claimButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginLeft: 10,
    flexShrink: 0,
  },
  claimText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});