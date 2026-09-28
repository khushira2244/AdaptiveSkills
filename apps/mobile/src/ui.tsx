import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable } from "./PointerPressable";

export const C = { ink: "#0A214A", blue: "#1265F5", pale: "#EEF5FF", line: "#D8E2F0", muted: "#667995", green: "#11A875", red: "#CC334F" };

export function Screen({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  return <SafeAreaView style={s.safe} edges={["top", "right", "bottom", "left"]}>
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={s.scroll}
      >
        <View style={s.content}>{children}</View>
      </ScrollView>
      {footer ? <View style={s.footerFrame}><View style={s.footerContent}>{footer}</View></View> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={[s.brand, compact && { flexDirection: "row", gap: 8 }]}><LinearGradient colors={["#1EB7E8", "#1768F5", "#7A38E8"]} style={[s.mark, compact && { width: 32, height: 32 }]}><Text style={[s.markText, compact && { fontSize: 17 }]}>A</Text></LinearGradient><View><Text style={[s.brandName, compact && { fontSize: 18 }]}>Adaptive<Text style={{ color: "#2778F5" }}>Skills</Text></Text><Text style={[s.tag, compact && { fontSize: 7, textAlign: "left", marginTop: 0 }]}>Learn. Build. Grow.</Text></View></View>;
}

export function Progress({ step, total = 7, onBack }: { step: number; total?: number; onBack?: () => void }) {
  return <View style={s.progressRow}>{onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={12} style={s.backTop}><Text style={s.backTopText}>← Back</Text></Pressable> : <View style={{ width: 66 }} />}<View style={s.dots}>{Array.from({ length: total }, (_, i) => <View key={i} style={[s.dot, i < step && s.dotOn]} />)}</View><Text style={s.step}>Step {step} of {total}</Text></View>;
}

export function Heading({ title, subtitle }: { title: ReactNode; subtitle?: string }) {
  return <View style={{ marginBottom: 22 }}><Text style={s.h1}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={{ marginBottom: 15 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#98A8BF" {...props} style={[s.input, props.multiline && s.textarea, error && s.inputError, props.style]} />{error ? <Text style={s.error}>{error}</Text> : null}</View>;
}

export function Choice({ title, detail, icon, selected, onPress }: { title: string; detail?: string; icon?: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.choice, selected && s.choiceOn]}>{icon ? <Text style={s.choiceIcon}>{icon}</Text> : null}<View style={{ flex: 1 }}><Text style={[s.choiceTitle, selected && { color: C.blue }]}>{title}</Text>{detail ? <Text style={s.choiceDetail}>{detail}</Text> : null}</View><View style={[s.radio, selected && s.radioOn]}>{selected && <Text style={{ color: "white", fontSize: 11 }}>✓</Text>}</View></Pressable>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.chip, selected && s.chipOn]}><Text style={[s.chipText, selected && { color: C.blue }]}>{selected ? "✓  " : ""}{label}</Text></Pressable>;
}

export function Notice({ children, tone = "blue" }: PropsWithChildren<{ tone?: "blue" | "red" | "green" }>) {
  const color = tone === "red" ? C.red : tone === "green" ? C.green : C.blue;
  return <View style={[s.notice, { borderColor: `${color}44`, backgroundColor: `${color}0D` }]}><Text style={[s.noticeText, { color }]}>{children}</Text></View>;
}

export function PrimaryButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pressable disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [s.primaryWrap, (pressed || disabled) && { opacity: .65 }]}><LinearGradient colors={["#1775FF", "#0755F3"]} style={s.primary}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{label}  →</Text>}</LinearGradient></Pressable>;
}

export function Footer({ primary, onPrimary, busy, secondary, onSecondary, disabled }: { primary: string; onPrimary: () => void; busy?: boolean; secondary?: string; onSecondary?: () => void; disabled?: boolean }) {
  return <View style={s.footer}>{secondary ? <Pressable onPress={onSecondary} disabled={busy}><Text style={s.secondary}>{secondary}</Text></Pressable> : <View />}<View style={{ minWidth: 170 }}><PrimaryButton label={primary} onPress={onPrimary} busy={busy} disabled={disabled} /></View></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" }, root: { flex: 1 }, scroll: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 36, flexGrow: 1, alignItems: "center" }, content: { width: "100%", maxWidth: 760, flexGrow: 1 }, footerFrame: { width: "100%", alignItems: "center", backgroundColor: "white" }, footerContent: { width: "100%", maxWidth: 760 },
  brand: { alignItems: "center", justifyContent: "center", marginVertical: 12 }, mark: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center" }, markText: { color: "white", fontWeight: "900", fontSize: 38 }, brandName: { color: C.ink, fontWeight: "900", fontSize: 25 }, tag: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", marginBottom: 28 }, backTop: { minWidth: 66, height: 36, borderRadius: 10, backgroundColor: "#F3F6FA", paddingHorizontal: 9, alignItems: "center", justifyContent: "center" }, backTopText: { color: C.ink, fontSize: 13, fontWeight: "800" }, dots: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 5 }, dot: { width: 17, height: 4, borderRadius: 3, backgroundColor: "#D7DFEA" }, dotOn: { backgroundColor: C.blue }, step: { width: 66, textAlign: "right", color: C.muted, fontSize: 11, fontWeight: "600" },
  h1: { color: C.ink, fontWeight: "900", fontSize: 28, lineHeight: 33 }, subtitle: { color: C.muted, fontSize: 15, lineHeight: 21, marginTop: 6 }, label: { color: C.ink, fontSize: 14, fontWeight: "700", marginBottom: 7 }, input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, height: 50, paddingHorizontal: 14, color: C.ink, backgroundColor: "white", fontSize: 15 }, textarea: { minHeight: 150, height: "auto", paddingTop: 14, textAlignVertical: "top" }, inputError: { borderColor: C.red }, error: { color: C.red, fontSize: 12, marginTop: 5 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 14, marginBottom: 9, backgroundColor: "white" }, choiceOn: { borderColor: C.blue, backgroundColor: "#F4F8FF", borderWidth: 2 }, choiceIcon: { fontSize: 23, width: 29, textAlign: "center" }, choiceTitle: { color: C.ink, fontWeight: "800", fontSize: 15 }, choiceDetail: { color: C.muted, fontSize: 12, marginTop: 2 }, radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center" }, radioOn: { borderColor: C.blue, backgroundColor: C.blue },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, backgroundColor: "white" }, chipOn: { borderColor: C.blue, backgroundColor: "#EFF5FF" }, chipText: { color: C.ink, fontSize: 13, fontWeight: "700" },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 10 }, noticeText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  footer: { padding: 15, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: "#EDF1F6", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "white" }, primaryWrap: { borderRadius: 12, overflow: "hidden" }, primary: { height: 51, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }, primaryText: { color: "white", fontWeight: "800", fontSize: 15 }, secondary: { color: C.blue, fontWeight: "800", padding: 12 },
});

export { s as styles };
