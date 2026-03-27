import { StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../lib/ui/AppButton";
import { Design } from "../lib/ui/design";
import { GlassCard } from "../lib/ui/GlassCard";
import type { ProtectedOrgAccessGateState } from "../lib/access";

type ProtectedOrgAccessGateScreenProps = {
  gateState: ProtectedOrgAccessGateState;
  statusMessage?: string | null;
  signedInAccountLabel?: string | null;
  currentUserId?: string | null;
  currentTenantId?: string | null;
  currentEmail?: string | null;
  backendRoles?: string[];
  authModeLabel?: string | null;
  authModeDetail?: string | null;
  bootstrapSql?: string | null;
  devIdentityDraft?: string;
  signingIn?: boolean;
  onSignIn: () => void;
  onSignOutOrSwitch?: () => void;
  onDevIdentityDraftChange?: (value: string) => void;
  onApplyDevIdentity?: () => void;
  onBack: () => void;
  onRequestAccess?: () => void;
};

export function ProtectedOrgAccessGateScreen({
  gateState,
  statusMessage,
  signedInAccountLabel,
  currentUserId,
  currentTenantId,
  currentEmail,
  backendRoles = [],
  authModeLabel,
  authModeDetail,
  bootstrapSql,
  devIdentityDraft = "",
  signingIn = false,
  onSignIn,
  onSignOutOrSwitch,
  onDevIdentityDraftChange,
  onApplyDevIdentity,
  onBack,
  onRequestAccess,
}: ProtectedOrgAccessGateScreenProps) {
  const title = gateState === "ACCESS_DENIED" ? "Access denied" : "Admin access required";
  const body =
    gateState === "ACCESS_DENIED"
      ? "This account is signed in, but it is not authorized to manage a sober housing organization."
      : "Organization setup is available only to authorized admins.";
  const detail =
    gateState === "ACCESS_DENIED"
      ? (statusMessage ??
        "Ask your organization or the platform owner to grant an organization-admin or house-manager role to this account.")
      : (statusMessage ??
        "Sign in with an authorized account to continue into organization setup.");

  return (
    <GlassCard style={styles.card} strong>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {signedInAccountLabel ? (
        <Text style={styles.meta}>Current account: {signedInAccountLabel}</Text>
      ) : null}
      {currentEmail && !signedInAccountLabel?.includes(currentEmail) ? (
        <Text style={styles.meta}>Email: {currentEmail}</Text>
      ) : null}
      {currentUserId ? <Text style={styles.meta}>User id: {currentUserId}</Text> : null}
      {currentTenantId ? <Text style={styles.meta}>Tenant id: {currentTenantId}</Text> : null}
      <View style={styles.roleList}>
        <Text style={styles.metaLabel}>Backend roles</Text>
        <Text style={styles.meta}>
          {backendRoles.length > 0 ? backendRoles.join(", ") : "No backend roles granted"}
        </Text>
      </View>
      {authModeLabel ? (
        <View style={styles.roleList}>
          <Text style={styles.metaLabel}>{authModeLabel}</Text>
          {authModeDetail ? <Text style={styles.detail}>{authModeDetail}</Text> : null}
        </View>
      ) : null}
      <Text style={styles.detail}>{detail}</Text>
      <View style={styles.buttonRow}>
        <AppButton
          title={signingIn ? "Checking access..." : "Sign in"}
          onPress={onSignIn}
          disabled={signingIn}
        />
        <View style={styles.buttonSpacer} />
        {onSignOutOrSwitch ? (
          <>
            <AppButton
              title="Sign out / switch account"
              onPress={onSignOutOrSwitch}
              variant="secondary"
            />
            <View style={styles.buttonSpacer} />
          </>
        ) : null}
        <AppButton title="Back" onPress={onBack} variant="secondary" />
      </View>
      {onDevIdentityDraftChange && onApplyDevIdentity ? (
        <View style={styles.devPanel}>
          <Text style={styles.metaLabel}>Development identity</Text>
          <TextInput
            style={styles.input}
            value={devIdentityDraft}
            onChangeText={onDevIdentityDraftChange}
            placeholder="enduser-a1"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <AppButton title="Use this DEV user" onPress={onApplyDevIdentity} variant="secondary" />
        </View>
      ) : null}
      {bootstrapSql ? (
        <View style={styles.sqlPanel}>
          <Text style={styles.metaLabel}>Bootstrap SQL</Text>
          <Text style={styles.code}>{bootstrapSql}</Text>
        </View>
      ) : null}
      {onRequestAccess ? (
        <View style={styles.secondaryAction}>
          <AppButton title="Request access" onPress={onRequestAccess} variant="secondary" />
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Design.spacing.md,
  },
  title: {
    color: Design.color.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  body: {
    color: Design.color.textPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  meta: {
    color: Design.color.textSecondary,
    fontSize: 13,
  },
  metaLabel: {
    color: Design.color.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  detail: {
    color: Design.color.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  roleList: {
    gap: Design.spacing.xs,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  buttonSpacer: {
    width: Design.spacing.sm,
  },
  devPanel: {
    gap: Design.spacing.sm,
  },
  input: {
    borderRadius: Design.radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: Design.color.textPrimary,
    paddingHorizontal: Design.spacing.md,
    paddingVertical: Design.spacing.sm,
  },
  sqlPanel: {
    gap: Design.spacing.xs,
    borderRadius: Design.radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: Design.spacing.md,
  },
  code: {
    color: Design.color.textPrimary,
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18,
  },
  secondaryAction: {
    marginTop: Design.spacing.xs,
  },
});
