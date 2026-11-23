import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
import type { DateTimeFieldProps } from './dateTimeFieldTypes';
import { LISTING_COLORS as C } from './formStyles';

// Web build (iPhone beta testers): the native picker doesn't run here, so use
// the browser's own date and time inputs. Their values are already
// 'YYYY-MM-DD' and 'HH:mm' wall-clock strings.

const inputStyle = (hasError?: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  backgroundColor: C.surface,
  border: `1px solid ${hasError ? C.error : C.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'inherit',
  color: C.text,
});

export default function DateTimeField(props: DateTimeFieldProps) {
  const { date, time, onChangeDate, onChangeTime, minDate, timePlaceholder = 'Time', clearable, hasError, label } = props;
  const hasValue = Boolean(date || time);

  return (
    <View style={styles.row}>
      <input
        type="date"
        aria-label={`${label} date`}
        value={date ?? ''}
        min={minDate}
        onChange={(e) => onChangeDate(e.target.value || null)}
        style={{ ...inputStyle(hasError), flex: 1.3 }}
      />
      <input
        type="time"
        aria-label={`${label} time`}
        title={timePlaceholder}
        value={time ?? ''}
        onChange={(e) => onChangeTime(e.target.value ? e.target.value.slice(0, 5) : null)}
        style={inputStyle(hasError)}
      />
      {clearable && hasValue ? (
        <Pressable
          style={styles.clear}
          onPress={() => {
            onChangeDate(null);
            onChangeTime(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
        >
          <Lucide name="x" size={18} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clear: { padding: 4 },
});
