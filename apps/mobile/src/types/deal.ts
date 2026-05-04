export type DealCategory = 'dining' | 'coffee' | 'retail' | 'nightlife'

export interface Deal {
    // Document ID in Firestone
    id: string;

    // Business Information
    businessName: string;
    businessLogoURL?: string | null;

    // Offer Information
    offerTitle: string;
    offerDescription?: string;
    discountCode?: string;

    // Classification
    category: DealCategory;
    tags?: string[];
    trendingScore: number;

    // Expiry Information
    expiresAt: string; // ISO-8601 format
    isExpiringSoon: boolean;

    // Redemption Information
    location: string;
    requiresStudentId: boolean;
    requirements?: string;
    maxClaimsPerUser?: number;

    // Metadata
    createdAt: string; // ISO-8601 format
    updatedAt: string; // ISO-8601 format
}


export function isActive(deal: Deal): boolean {
    return new Date(deal.expiresAt).getTime() > Date.now();
}