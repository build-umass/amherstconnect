import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DealCard from '../../components/DealCard';
import DealCategoryFilterBar from '../../components/DealCategoryFilterBar';
import ClaimCodeModal from '../../components/ClaimCodeModal';
import { useDeals } from '../../hooks/useDeals';
import { Deal, DealCategory } from '../../types/deal';

export default function DealsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<'All' | DealCategory>('All');
  const { deals, loading } = useDeals({ category: selectedCategory });
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);

  const handleClaim = (dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (deal) {
      setSelectedDeal(deal);
      setShowClaimModal(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerSection, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Trending Deals</Text>
      </View>

      {/* Category Filter Bar */}
      <DealCategoryFilterBar
        selected={selectedCategory}
        onSelect={(category) => setSelectedCategory(category)}
      />

      {/* Deal Cards List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator color="#8B1A1A" size="large" />
          </View>
        ) : deals.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No deals available in this category.</Text>
          </View>
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClaim={handleClaim} />
          ))
        )}
      </ScrollView>

      {/* Claim Code Modal */}
      <ClaimCodeModal
        visible={showClaimModal}
        deal={selectedDeal}
        onClose={() => {
          setShowClaimModal(false);
          setSelectedDeal(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  headerSection: {
    backgroundColor: '#8B1A1A',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingTop: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
});
