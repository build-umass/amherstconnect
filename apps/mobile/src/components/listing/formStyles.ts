import { StyleSheet } from 'react-native';

// Colors from the Phase 2 design doc listing-form mockups.
export const LISTING_COLORS = {
  maroon: '#881c1c',
  maroonTint: '#f1e1e1',
  background: '#f8f4f3',
  surface: '#ffffff',
  border: '#d9d0ce',
  text: '#1d1b1b',
  muted: '#6b6564',
  error: '#b3261e',
  errorTint: '#fbeaea',
  success: '#1e6b3a',
  successTint: '#e6f2ea',
};

const C = LISTING_COLORS;

export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: C.error,
  },
  pressableText: {
    fontSize: 15,
    color: C.text,
  },
  placeholderText: {
    fontSize: 15,
    color: C.muted,
  },
});
