import { StyleSheet } from "react-native";
import { Design } from "./design";

export const ui = StyleSheet.create({
  title: { color: Design.color.textPrimary, fontSize: 30, fontWeight: "800" },
  subtitle: { color: Design.color.textSecondary, fontSize: 14, fontWeight: "600" },
  h2: { color: Design.color.textPrimary, fontSize: 18, fontWeight: "800" },
  body: { color: Design.color.textSecondary, fontSize: 14, lineHeight: 20 },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Design.radius.chip,
    backgroundColor: Design.color.chipFill,
    borderWidth: 1,
    borderColor: Design.color.chipStroke,
  },
  chipText: { color: Design.color.textPrimary, fontWeight: "700", fontSize: 12 },

  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Design.radius.chip,
    backgroundColor: Design.color.okFill,
  },
  statusText: { color: Design.color.okText, fontWeight: "800", fontSize: 12 },
});
