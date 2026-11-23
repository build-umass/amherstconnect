import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Lucide } from '@react-native-vector-icons/lucide';
import {
  deviceDateToLocal,
  formatLocalDate,
  formatLocalTime,
  localToDeviceDate,
} from '../../services/listingForm';
import type { DateTimeFieldProps } from './dateTimeFieldTypes';
import { LISTING_COLORS as C, formStyles } from './formStyles';

type Mode = 'date' | 'time';

/**
 * Date box + time box using the native pickers. The picker only edits a wall
 * clock (see localToDeviceDate), so the phone's own zone doesn't matter.
 */
export default function DateTimeField(props: DateTimeFieldProps) {
  const { date, time, onChangeDate, onChangeTime, minDate, timePlaceholder = 'Time', clearable, hasError, label } = props;
  const [iosMode, setIosMode] = useState<Mode | null>(null);

  const current = localToDeviceDate(date, time ?? '12:00', new Date());
  const minimumDate = minDate ? localToDeviceDate(minDate, '00:00', new Date()) : undefined;

  const apply = (mode: Mode, picked: Date) => {
    const local = deviceDateToLocal(picked);
    if (mode === 'date') onChangeDate(local.date);
    else onChangeTime(local.time);
  };

  const open = (mode: Mode) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        minimumDate: mode === 'date' ? minimumDate : undefined,
        onValueChange: (_event, picked) => apply(mode, picked),
      });
    } else {
      setIosMode(mode);
    }
  };

  const hasValue = Boolean(date || time);

  return (
    <View style={styles.row}>
      <Pressable
        style={[formStyles.input, styles.dateBox, hasError && formStyles.inputError]}
        onPress={() => open('date')}
        accessibilityRole="button"
        accessibilityLabel={`${label} date`}
        accessibilityValue={{ text: date ? formatLocalDate(date) : 'Not set' }}
      >
        <Text style={date ? formStyles.pressableText : formStyles.placeholderText}>
          {date ? formatLocalDate(date) : 'Date'}
        </Text>
      </Pressable>
      <Pressable
        style={[formStyles.input, styles.timeBox, hasError && formStyles.inputError]}
        onPress={() => open('time')}
        accessibilityRole="button"
        accessibilityLabel={`${label} time`}
        accessibilityValue={{ text: time ? formatLocalTime(time) : 'Not set' }}
      >
        <Text style={time ? formStyles.pressableText : formStyles.placeholderText}>
          {time ? formatLocalTime(time) : timePlaceholder}
        </Text>
      </Pressable>
      {clearable && hasValue ? (
        <Pressable
          style={styles.clear}
          onPress={() => {
            onChangeDate(null);
            onChangeTime(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
          hitSlop={8}
        >
          <Lucide name="x" size={18} color={C.muted} />
        </Pressable>
      ) : null}

      {/* iOS: the picker sits in a sheet with a Done button. */}
      {Platform.OS === 'ios' && iosMode ? (
        <Modal transparent animationType="slide" onRequestClose={() => setIosMode(null)}>
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <DateTimePicker
                value={current}
                mode={iosMode}
                display={iosMode === 'date' ? 'inline' : 'spinner'}
                minimumDate={iosMode === 'date' ? minimumDate : undefined}
                onValueChange={(_event, picked) => apply(iosMode, picked)}
              />
              <Pressable style={styles.done} onPress={() => setIosMode(null)} accessibilityRole="button">
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBox: { flex: 1.3 },
  timeBox: { flex: 1 },
  clear: { padding: 4 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: C.surface, padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  done: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16 },
  doneText: { color: C.maroon, fontSize: 16, fontWeight: '600' },
});
