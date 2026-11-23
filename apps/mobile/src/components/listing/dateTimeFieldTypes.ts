import type { LocalDate, LocalTime } from '../../services/listingForm';

/** Shared by DateTimeField.tsx (Android/iOS) and DateTimeField.web.tsx. */
export interface DateTimeFieldProps {
  /** Wall-clock values in America/New_York. */
  date: LocalDate | null;
  time: LocalTime | null;
  onChangeDate: (date: LocalDate | null) => void;
  onChangeTime: (time: LocalTime | null) => void;
  /** Earliest pickable date (today in New York). */
  minDate?: LocalDate;
  /** Time placeholder, e.g. "Time" or "Time (optional)". */
  timePlaceholder?: string;
  /** Show a clear button once anything is set. */
  clearable?: boolean;
  hasError?: boolean;
  /** Field name for screen readers, e.g. "Starts". */
  label: string;
}
