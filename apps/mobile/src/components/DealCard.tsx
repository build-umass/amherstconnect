import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Deal } from '../types/deal';

interface Props {
  deal: Deal;
  onClaim: (dealId: string) => void;
}

export default function DealCard({ deal, onClaim }: Props) {
  const isExpiringSoon = deal.isExpiringSoon;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9}>
      {/* Category Badge */}
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryText}>{deal.category.toUpperCase()}</Text>
      </View>

      {/* Header - Business Name */}
      <View style={styles.header}>
        <Text style={styles.businessName}>{deal.businessName}</Text>
        {isExpiringSoon && (
          <Text style={styles.expiryBadge}>Expiring Soon!</Text>
        )}
      </View>

      {/* Offer Title */}
      <Text style={styles.offerTitle}>{deal.offerTitle}</Text>

      {/* Meta info */}
      <View style={styles.metaRow}>
        <Text style={styles.metaItem}>📍 {deal.location}</Text>
        <Text style={styles.metaItem}>⏰ {deal.expiresAt}</Text>
      </View>

      {/* Claim Button */}
      <TouchableOpacity
        style={styles.claimButton}
        onPress={() => onClaim(deal.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.claimButtonText}>Claim Discount</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#8B1A1A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  categoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  expiryBadge: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerTitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 12,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metaItem: {
    fontSize: 13,
    color: '#888',
  },
  claimButton: {
    backgroundColor: '#8B1A1A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
