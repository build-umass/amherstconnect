import { useEffect, useState } from 'react';
import { Deal, DealCategory } from '../types/deal';

// TEMPORARY MOCK HOOK - Damian will replace this with real implementation
// This allows UI development to proceed independently

interface UseDealsOptions {
  category?: DealCategory | 'All';
}

export function useDeals({ category = 'All' }: UseDealsOptions = {}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const MOCK_DEALS: Deal[] = [
    {
      id: 'deal-1',
      businessName: 'Bueno Y Sano',
      offerTitle: '15% off your entire order',
      category: 'dining',
      expiresAt: '2026-05-15T23:59:59Z',
      discountCode: 'EAT15',
      location: 'Amherst Center',
      trendingScore: 95,
      isExpiringSoon: false,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      tags: ['mexican', 'student-favorite'],
      requiresStudentId: true,
    },
    {
      id: 'deal-2',
      businessName: 'The UPub',
      offerTitle: 'Free appetizer with entree purchase',
      category: 'dining',
      expiresAt: '2026-05-20T23:59:59Z',
      discountCode: 'APPETIZER',
      location: 'Downtown Amherst',
      trendingScore: 88,
      isExpiringSoon: false,
      createdAt: '2026-04-05T00:00:00Z',
      updatedAt: '2026-04-05T00:00:00Z',
      tags: ['pub', 'dinner'],
      requiresStudentId: true,
    },
    {
      id: 'deal-3',
      businessName: 'Amherst Coffee',
      offerTitle: 'Buy 2 drinks, get 1 free',
      category: 'coffee',
      expiresAt: '2026-05-10T23:59:59Z',
      discountCode: 'COFFEE3',
      location: 'Main Street',
      trendingScore: 92,
      isExpiringSoon: true,
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
      tags: ['caffeine', 'study-treat'],
      requiresStudentId: false,
    },
    {
      id: 'deal-4',
      businessName: 'UMass Bookstore',
      offerTitle: '$10 off purchases over $50',
      category: 'retail',
      expiresAt: '2026-05-25T23:59:59Z',
      discountCode: 'STUDENT10',
      location: 'Campus Center',
      trendingScore: 75,
      isExpiringSoon: false,
      createdAt: '2026-04-08T00:00:00Z',
      updatedAt: '2026-04-08T00:00:00Z',
      tags: ['books', 'supplies'],
      requiresStudentId: true,
      maxClaimsPerUser: 1,
    },
    {
      id: 'deal-5',
      businessName: 'The Drake',
      offerTitle: 'Free cover for UMass students',
      category: 'nightlife',
      expiresAt: '2026-05-12T23:59:59Z',
      discountCode: 'STUDENTNIGHT',
      location: 'Downtown',
      trendingScore: 85,
      isExpiringSoon: true,
      createdAt: '2026-04-12T00:00:00Z',
      updatedAt: '2026-04-12T00:00:00Z',
      tags: ['club', 'music'],
      requiresStudentId: true,
      requirements: 'Valid UMass student ID required',
    },
  ];

  useEffect(() => {
    setLoading(true);
    // Simulate API delay
    const timer = setTimeout(() => {
      const filtered = category === 'All'
        ? MOCK_DEALS
        : MOCK_DEALS.filter(deal => deal.category === category);

      // Sort by trending score
      const sorted = filtered.sort((a, b) => b.trendingScore - a.trendingScore);

      setDeals(sorted);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [category]);

  return { deals, loading };
}

// Default export for flexibility
export default useDeals;
