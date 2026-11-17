
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
import { Deal } from '../types/deal';

interface Props {
  deal: Deal;
  onClaim: (dealId: string) => void;
}

const CATEGORY_ICONS = {
  dining: 'utensils',
  coffee: 'coffee',
  retail: 'shirt',
  nightlife: 'martini',
} as const;

export default function DealCard({ deal, onClaim }: Props) {
  const isExpiringSoon = deal.isExpiringSoon;

  const categoryIcon =
    CATEGORY_ICONS[deal.category as keyof typeof CATEGORY_ICONS] ?? 'tag';

  const accentColor = isExpiringSoon ? '#F5A623' : '#8B1A1A';

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: accentColor }]}
      activeOpacity={0.88}
    >
      {/* Category icon */}
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: isExpiringSoon ? '#FFF8EE' : '#FFF0F0' },
        ]}
      >
        <Lucide
          name={categoryIcon}
          size={22}
          color={accentColor}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.categoryLabel, { color: accentColor }]}>
            {deal.category.toUpperCase()}
          </Text>

          {isExpiringSoon && (
            <View style={styles.expiryBadge}>
              <Lucide name="alarm-clock" size={12} color="#E53935" />
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

      {/* Claim button */}
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
