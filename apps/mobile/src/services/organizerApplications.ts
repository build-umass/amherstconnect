export type OrganizerApplicationStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface OrganizerApplicationDraft {
  organizationType: string;
  organizationName: string;
  contactName: string;
  contactRole: string;
  affiliationUrl: string;
  amherstAddress: string;
  about: string;
  postingPlans: string;
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
  reason: string | null;
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
  postingPlans: '',
  termsAccepted: false,
};

export const ORGANIZER_STATUS_FIXTURES: Record<OrganizerApplicationStatus, { label: string; reason: string | null }> = {
  pending: { label: 'Under review', reason: null },
  approved: { label: 'Approved', reason: null },
  rejected: { label: 'Needs changes', reason: 'Please add an active affiliation link for your organization.' },
  revoked: { label: 'Access revoked', reason: 'Organizer access is no longer active. Contact the Amherst Connect team if you believe this is a mistake.' },
};

export function validateOrganizerApplication(draft: OrganizerApplicationDraft): OrganizerApplicationErrors {
  const errors: OrganizerApplicationErrors = {};
  const required: Array<[Exclude<OrganizerApplicationField, 'termsAccepted'>, string]> = [
    ['organizationType', 'Choose an organization type.'],
    ['organizationName', 'Enter an organization name.'],
    ['contactName', 'Enter a contact name.'],
    ['contactRole', 'Enter your role in the organization.'],
    ['postingPlans', 'Tell us what you plan to post.'],
  ];

  for (const [field, message] of required) {
    if (!draft[field].trim()) errors[field] = message;
  }

  if (draft.about.length > 500) errors.about = 'About must be 500 characters or fewer.';
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
    reason: null,
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
    reason: fixture.reason,
    submittedAt: new Date(0).toISOString(),
  };
}
