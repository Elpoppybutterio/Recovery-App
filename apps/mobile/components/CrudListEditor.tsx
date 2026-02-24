import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { routineTheme } from "../theme/tokens";

export function CrudListEditor({
  title,
  items,
  onAdd,
  onChange,
  onRemove,
  placeholder,
}: {
  title: string;
  items: Array<{ id: string; text: string }>;
  onAdd: () => void;
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addText}>+ Add</Text>
        </Pressable>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <TextInput
            style={styles.input}
            value={item.text}
            placeholder={placeholder}
            placeholderTextColor="rgba(245,243,255,0.45)"
            onChangeText={(value) => onChange(item.id, value)}
            multiline
          />
          <Pressable style={styles.removeBtn} onPress={() => onRemove(item.id)}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {items.length === 0 ? <Text style={styles.empty}>No items yet.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  addText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: routineTheme.colors.textPrimary,
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    minHeight: 42,
  },
  removeBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: routineTheme.radii.pill,
    backgroundColor: "rgba(239,68,68,0.18)",
  },
  removeText: {
    color: "#fecaca",
    fontSize: 11,
    fontWeight: "700",
  },
  empty: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
  },
});
