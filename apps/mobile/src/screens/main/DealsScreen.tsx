import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
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
  const [searchQuery, setSearchQuery] = useState('');
  const { deals, loading } = useDeals({ category: selectedCategory });
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
 
  const handleClaim = (dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (deal) {
      setSelectedDeal(deal);
      setShowClaimModal(true);
    }
  };
 
  const filteredDeals = useMemo(() => {
    if (!searchQuery.trim()) return deals;
    const q = searchQuery.toLowerCase();
    return deals.filter(
      (d) =>
        d.offerTitle.toLowerCase().includes(q) ||
        d.businessName.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [deals, searchQuery]);
 
  const expiringSoon = filteredDeals.filter((d) => d.isExpiringSoon);
  const allDeals = filteredDeals.filter((d) => !d.isExpiringSoon);
  const activeCount = deals.length;
 
  return (
    <View style={[styles.container, { paddingTop:0 }]}> 
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Deals & Discounts</Text>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>{activeCount} active</Text>
        </View>
      </View>
 
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search deals..."
          placeholderTextColor="#B0B0B0"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
 
      {/* Category Filter Bar */}
      <DealCategoryFilterBar
        selected={selectedCategory}
        onSelect={(category) => setSelectedCategory(category)}
      />
 
      {/* Scroll content*/}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator color="#F5A623" size="large" />
          </View>
        ) : filteredDeals.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No deals found.</Text>
          </View>
        ) : (
          <>
            {!searchQuery && (
              <TouchableOpacity style={styles.trendingBanner} activeOpacity={0.85}>
                <Text style={styles.trendingIcon}>⚡</Text>
                <View>
                  <Text style={styles.trendingLabel}>TRENDING NOW</Text>
                  <Text style={styles.trendingTitle}>{activeCount} deals near campus</Text>
                  <Text style={styles.trendingSubtitle}>Show student ID to redeem</Text>
                </View>
              </TouchableOpacity>
            )}
 
            {expiringSoon.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Expiring Soon</Text>
                {expiringSoon.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onClaim={handleClaim} />
                ))}
              </>
            )}
 
            {allDeals.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>All Deals</Text>
                {allDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onClaim={handleClaim} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
 
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
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,          
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  activeBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
  },
  // Search: no top margin
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
  trendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  trendingIcon: {
    fontSize: 24,
  },
  trendingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  trendingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  trendingSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingTop: 0,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
});