import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme/tokens";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toPickerDate(hhmm24: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm24.trim());
  const now = new Date();
  if (!match) {
    now.setHours(8, 0, 0, 0);
    return now;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  now.setHours(
    Number.isFinite(hours) ? Math.max(0, Math.min(23, hours)) : 8,
    Number.isFinite(minutes) ? Math.max(0, Math.min(59, minutes)) : 0,
    0,
    0,
  );
  return now;
}

function toHhmm24(value: Date): string {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function formatTimeLabel(value: Date): string {
  const hours24 = value.getHours();
  const minutes = pad2(value.getMinutes());
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${meridiem}`;
}

export function TimePickerField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
}) {
  const pickerValue = toPickerDate(value);
  const formattedValue = formatTimeLabel(pickerValue);
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [androidPickerVisible, setAndroidPickerVisible] = useState(false);
  const [draftValue, setDraftValue] = useState<Date>(pickerValue);

  function openPicker() {
    if (disabled) {
      return;
    }
    const nextDraft = toPickerDate(value);
    setDraftValue(nextDraft);
    if (Platform.OS === "ios") {
      setIosPickerVisible(true);
      return;
    }
    setAndroidPickerVisible(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, nextDate?: Date) {
    setAndroidPickerVisible(false);
    if (event.type !== "set" || !nextDate) {
      return;
    }
    onChange(toHhmm24(nextDate));
  }

  function handleIosChange(_: DateTimePickerEvent, nextDate?: Date) {
    if (!nextDate) {
      return;
    }
    setDraftValue(nextDate);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formattedValue}`}
        accessibilityHint="Opens the time picker"
        disabled={disabled}
        onPress={openPicker}
        style={[styles.fieldButton, disabled ? styles.fieldButtonDisabled : null]}
      >
        <View style={styles.valueBlock}>
          <Text style={styles.fieldValue}>{formattedValue}</Text>
          <Text style={styles.fieldMeta}>Tap to change</Text>
        </View>
        <Text style={styles.fieldChevron}>▾</Text>
      </Pressable>

      {androidPickerVisible ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          is24Hour={false}
          onChange={handleAndroidChange}
        />
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setIosPickerVisible(false)}
        transparent
        visible={iosPickerVisible}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setIosPickerVisible(false)} style={styles.sheetAction}>
                <Text style={styles.sheetActionText}>Cancel</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(toHhmm24(draftValue));
                  setIosPickerVisible(false);
                }}
                style={styles.sheetAction}
              >
                <Text style={styles.sheetActionText}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draftValue}
              mode="time"
              display="spinner"
              minuteInterval={1}
              onChange={handleIosChange}
              themeVariant="dark"
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldButtonDisabled: {
    opacity: 0.55,
  },
  valueBlock: {
    gap: 2,
  },
  fieldValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  fieldMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  fieldChevron: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 10, 26, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "rgba(33, 15, 72, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  sheetAction: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sheetActionText: {
    color: colors.neonLavender,
    fontSize: 15,
    fontWeight: "700",
  },
});
