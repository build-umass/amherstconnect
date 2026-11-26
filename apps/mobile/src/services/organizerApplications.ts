export const ORGANIZER_KINDS = [
  { value: 'individual', label: 'Individual' }, { value: 'informal_group', label: 'Informal group' },
  { value: 'local_business', label: 'Local business' }, { value: 'student_organization', label: 'Student organization' },
  { value: 'nonprofit', label: 'Nonprofit' }, { value: 'umass_department', label: 'UMass department' },
  { value: 'other', label: 'Other' },
];
export const POSTING_FREQUENCIES = [
  { value: 'less_than_monthly', label: 'Less than monthly' }, { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' }, { value: 'several_per_week', label: 'Several per week' },
];

export function applicationRpcParameters(draft: OrganizerApplicationDraft) {
  const errors = validateOrganizerApplication(draft);
  if (Object.keys(errors).length) throw new Error('Complete the required application fields.');
  return {
    p_organizer_name: draft.organizationName.trim(), p_organizer_kind: draft.organizationType,
    p_contact_name: draft.contactName.trim(), p_contact_role: draft.contactRole.trim(),
    p_affiliation_url: draft.affiliationUrl.trim(), p_amherst_street_address: draft.amherstAddress.trim() || null,
    p_about: draft.about.trim(), p_plans_events: draft.plansEvents, p_plans_deals: draft.plansDeals,
    p_estimated_posting_frequency: draft.estimatedPostingFrequency, p_accept_terms: draft.termsAccepted,
  };
}

export type OrganizerApplicationStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'withdrawn';

export interface OrganizerApplicationDraft {
  organizationType: string;
  organizationName: string;
  contactName: string;
  contactRole: string;
  affiliationUrl: string;
  amherstAddress: string;
  about: string;
  plansEvents: boolean;
  plansDeals: boolean;
  estimatedPostingFrequency: string;
  termsAccepted: boolean;
}

export type OrganizerApplicationField = keyof OrganizerApplicationDraft;
export type OrganizerApplicationErrors = Partial<Record<OrganizerApplicationField, string>>;

export interface OrganizerApplicationRecord {
  id: string;
  accountId: string;
  /** Private reviewer contact, sourced from the authenticated account. */
  privateContactEmail: string;
  draft: OrganizerApplicationDraft;
  status: OrganizerApplicationStatus;
  reviewerNote: string | null;
  submittedAt: string;
}

export const EMPTY_ORGANIZER_APPLICATION: OrganizerApplicationDraft = {
  organizationType: '',
  organizationName: '',
  contactName: '',
  contactRole: '',
  affiliationUrl: '',
  amherstAddress: '',
  about: '',
  plansEvents: false,
  plansDeals: false,
  estimatedPostingFrequency: '',
  termsAccepted: false,
};

export const ORGANIZER_STATUS_FIXTURES: Record<OrganizerApplicationStatus, { label: string; reviewerNote: string | null }> = {
  withdrawn: { label: 'Withdrawn', reviewerNote: null },
  pending: { label: 'Under review', reviewerNote: null },
  approved: { label: 'Approved', reviewerNote: null },
  rejected: { label: 'Needs changes', reviewerNote: 'Please add an active affiliation link for your organization.' },
  revoked: { label: 'Access revoked', reviewerNote: 'Organizer access is no longer active. Contact the Amherst Connect team if you believe this is a mistake.' },
};

export function validateOrganizerApplication(draft: OrganizerApplicationDraft): OrganizerApplicationErrors {
  const errors: OrganizerApplicationErrors = {};
  const required: Array<[Exclude<OrganizerApplicationField, 'termsAccepted' | 'plansEvents' | 'plansDeals'>, string]> = [
    ['organizationType', 'Choose an organization type.'],
    ['organizationName', 'Enter an organization name.'],
    ['contactName', 'Enter a contact name.'],
    ['contactRole', 'Enter your role in the organization.'],
    ['estimatedPostingFrequency', 'Choose how often you expect to post.'],
  ];

  for (const [field, message] of required) {
    if (!draft[field].trim()) errors[field] = message;
  }

  if (!ORGANIZER_KINDS.some(option => option.value === draft.organizationType)) errors.organizationType = 'Choose an organizer type.';
  if (!POSTING_FREQUENCIES.some(option => option.value === draft.estimatedPostingFrequency)) errors.estimatedPostingFrequency = 'Choose how often you expect to post.';
  if (!draft.plansEvents && !draft.plansDeals) errors.plansEvents = 'Choose events, deals, or both.';
  if (!draft.about.trim()) errors.about = 'Tell reviewers about your organizer.';
  if (draft.organizationName.trim().length > 200) errors.organizationName = 'Use up to 200 characters.';
  if (draft.contactName.trim().length > 120) errors.contactName = 'Use up to 120 characters.';
  if (draft.contactRole.trim().length > 120) errors.contactRole = 'Use up to 120 characters.';
  if (draft.amherstAddress.trim().length > 300) errors.amherstAddress = 'Use up to 300 characters.';
  if (draft.about.trim().length > 500) errors.about = 'About must be 500 characters or fewer.';
  if (draft.affiliationUrl.trim()) {
    try {
      const url = new URL(draft.affiliationUrl.trim());
      if (url.protocol !== 'https:') errors.affiliationUrl = 'Use a secure HTTPS link.';
    } catch {
      errors.affiliationUrl = 'Enter a valid HTTPS link.';
    }
  } else {
    errors.affiliationUrl = 'Enter an affiliation link.';
  }
  if (!draft.termsAccepted) errors.termsAccepted = 'Accept the terms to continue.';
  return errors;
}

/** Fixture-only workflow until the organizer application API/schema is available on dev. */
export function createOrganizerApplicationFixture(
  draft: OrganizerApplicationDraft,
  account: { id: string; email: string },
  submittedAt = new Date().toISOString(),
): OrganizerApplicationRecord {
  return {
    id: `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    accountId: account.id,
    privateContactEmail: account.email,
    draft: { ...draft, affiliationUrl: draft.affiliationUrl.trim() },
    status: 'pending',
    reviewerNote: null,
    submittedAt,
  };
}

export function organizerStatusFixture(status: OrganizerApplicationStatus): OrganizerApplicationRecord {
  const fixture = ORGANIZER_STATUS_FIXTURES[status];
  return {
    id: `preview-${status}`,
    accountId: 'preview-account',
    privateContactEmail: '',
    draft: { ...EMPTY_ORGANIZER_APPLICATION },
    status,
    reviewerNote: fixture.reviewerNote,
    submittedAt: new Date(0).toISOString(),
  };
}
