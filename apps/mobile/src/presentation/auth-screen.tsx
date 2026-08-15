import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Button, Heading, Screen, Text, TextField, nativeTheme } from "@kontave/ui-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authErrorMessage, useAuth } from "../auth/auth-context";
import { readRememberedEmail, writeRememberedEmail } from "../auth/remembered-email-storage";

type Mode = "sign-in" | "register" | "verify-registration" | "request-recovery" | "verify-recovery" | "complete-recovery";

export function AuthScreen(): React.JSX.Element {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const responsive = mobileMetrics(width);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readRememberedEmail().then((rememberedEmail) => {
      if (!active || !rememberedEmail) return;
      setEmail(rememberedEmail);
      setRemember(true);
    });
    return () => { active = false; };
  }, []);

  function navigate(nextMode: Mode): void {
    setError(null);
    setPassword("");
    setPasswordConfirmation("");
    setCode("");
    setMode(nextMode);
  }

  async function submit(): Promise<void> {
    if ((mode === "register" || mode === "complete-recovery") && password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "sign-in") {
        await auth.signIn(email, password);
        await writeRememberedEmail(remember ? email : null);
      }
      if (mode === "register") { await auth.register(email, password); navigate("verify-registration"); }
      if (mode === "verify-registration") await auth.verifyRegistration(email, code);
      if (mode === "request-recovery") { await auth.requestRecovery(email); navigate("verify-recovery"); }
      if (mode === "verify-recovery") { await auth.verifyRecovery(email, code); navigate("complete-recovery"); }
      if (mode === "complete-recovery") { await auth.completeRecovery(password); navigate("sign-in"); }
    } catch (cause: unknown) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const needsEmail = mode !== "complete-recovery";
  const needsCode = mode === "verify-registration" || mode === "verify-recovery";
  const needsPassword = mode === "sign-in" || mode === "register" || mode === "complete-recovery";
  const needsConfirmation = mode === "register" || mode === "complete-recovery";

  return <Screen style={styles.screen}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { minHeight: responsive.heroHeight + insets.top, paddingHorizontal: responsive.horizontalPadding, paddingTop: responsive.heroPaddingTop + insets.top }]}>
          <AnimatedBlobs />
          <View accessibilityElementsHidden style={styles.pattern}>
            <View style={[styles.patternLine, styles.patternHorizontalOne]} /><View style={[styles.patternLine, styles.patternHorizontalTwo]} />
            <View style={[styles.patternLine, styles.patternVerticalOne]} /><View style={[styles.patternLine, styles.patternVerticalTwo]} />
          </View>
          <View style={styles.heroContent}>
            <View accessibilityLabel="Kontave" style={styles.brand}>
              <Text style={styles.brandName}>kontave</Text><Text style={styles.brandDot}>.</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Gestión empresarial venezolana</Text>
              <Heading style={[styles.heroHeading, { fontSize: responsive.heroTitleSize, lineHeight: responsive.heroTitleSize * 1.06 }]}>Todo tu negocio,{"\n"}en un solo lugar<Text style={styles.heroTitleDot}>.</Text></Heading>
              <Text style={styles.heroDescription}>Nómina, inventario y operaciones conectadas en una experiencia diseñada para trabajar con claridad.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.formPanel, { paddingHorizontal: responsive.horizontalPadding }]}>
          <View style={styles.panelContent}>
            {mode !== "sign-in" ? <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigate("sign-in")} style={styles.backButton}><Ionicons color={nativeTheme.color.primary} name="arrow-back" size={22} /></Pressable> : null}
            <Text style={styles.loginBrand}>KONTAVE<Text style={styles.loginBrandDot}>.</Text></Text>
            <Heading style={[styles.loginTitle, { fontSize: responsive.loginTitleSize, lineHeight: responsive.loginTitleSize * 1.02 }]}>{titleFor(mode)}</Heading>
            <Text style={styles.loginDescription}>{descriptionFor(mode)}</Text>
            <View style={styles.formArea}>

            {error ? <Alert intent="danger">{error}</Alert> : null}

            <View style={styles.fields}>
              {needsEmail ? <TextField controlHeight={responsive.controlHeight} label="Correo electrónico" placeholder="nombre@empresa.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} /> : null}
              {needsCode ? <TextField controlHeight={responsive.controlHeight} label="Código de verificación" placeholder="00000000" keyboardType="number-pad" maxLength={8} value={code} onChangeText={setCode} /> : null}
              {needsPassword ? <TextField
                label={mode === "complete-recovery" ? "Nueva contraseña" : "Contraseña"}
                controlHeight={responsive.controlHeight}
                labelAction={mode === "sign-in" ? <Pressable accessibilityRole="button" onPress={() => navigate("request-recovery")}><Text style={styles.fieldLink}>¿Olvidaste tu contraseña?</Text></Pressable> : undefined}
                endAdornment={<PasswordVisibility visible={passwordVisible} onPress={() => setPasswordVisible((current) => !current)} />}
                placeholder="••••••••" secureTextEntry={!passwordVisible} value={password} onChangeText={setPassword}
              /> : null}
              {needsConfirmation ? <TextField controlHeight={responsive.controlHeight} label="Confirmar contraseña" placeholder="••••••••" secureTextEntry value={passwordConfirmation} onChangeText={setPasswordConfirmation} /> : null}
            </View>

            {mode === "sign-in" ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember((current) => !current)} style={styles.remember}>
              <View style={[styles.checkbox, remember && styles.checkboxChecked]}>{remember ? <Ionicons color="#FFFFFF" name="checkmark" size={13} /> : null}</View>
              <Text style={styles.rememberText}>Recordarme</Text>
            </Pressable> : null}

            <Button controlHeight={responsive.controlHeight} label={actionFor(mode)} loading={busy} onPress={() => { void submit(); }} size="lg" />

            {mode === "verify-registration" ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void auth.resendRegistration(email).catch((cause: unknown) => setError(authErrorMessage(cause))); }}><Text style={styles.centerLink}>Reenviar código</Text></Pressable> : null}
            </View>

            <View style={styles.register}>
              {mode === "sign-in" ? <Text style={styles.footerText}>¿Aún no tienes cuenta? <Text onPress={() => navigate("register")} style={styles.footerLink}>Crear cuenta</Text></Text> :
                <Text style={styles.footerText}>¿Ya tienes una cuenta? <Text onPress={() => navigate("sign-in")} style={styles.footerLink}>Iniciar sesión</Text></Text>}
            </View>
            <View style={styles.mobileFooter}>
              <Text style={styles.footerTitle}>Preparado para tu operación</Text>
              <View style={styles.footerBadges}><Text style={styles.footerBadge}>LOTTT</Text><Text style={styles.footerBadge}>SENIAT</Text><Text style={styles.footerBadge}>BCV</Text></View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}

function PasswordVisibility({ onPress, visible }: { readonly onPress: () => void; readonly visible: boolean }): React.JSX.Element {
  return <Pressable accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"} accessibilityRole="button" hitSlop={10} onPress={onPress} style={styles.eyeButton}>
    <Ionicons color={nativeTheme.color.muted} name={visible ? "eye-off-outline" : "eye-outline"} size={22} />
  </Pressable>;
}

function AnimatedBlobs(): React.JSX.Element {
  const [motion] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(motion, { duration: 6_500, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(motion, { duration: 6_500, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: Platform.OS !== "web" }),
      ]));
      animation.start();
    });
    return () => { mounted = false; animation?.stop(); };
  }, [motion]);

  const firstTransform = {
    transform: [
      { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [-5, 12] }) },
      { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [-3, 9] }) },
      { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ["-22deg", "-17deg"] }) },
      { skewX: "-9deg" },
      { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
    ],
  };
  const secondTransform = {
    transform: [
      { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [8, -9] }) },
      { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [5, -8] }) },
      { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ["26deg", "20deg"] }) },
      { skewY: "8deg" },
      { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1.03, 0.98] }) },
    ],
  };
  const thirdTransform = {
    transform: [
      { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) },
      { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [4, -7] }) },
      { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ["18deg", "23deg"] }) },
      { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1.02, 0.96] }) },
    ],
  };
  return <View accessibilityElementsHidden pointerEvents="none" style={styles.blobCanvas}>
    <Animated.View style={[styles.blob, styles.blobLeft, firstTransform]} />
    <Animated.View style={[styles.blob, styles.blobRight, secondTransform]} />
    <Animated.View style={[styles.blob, styles.blobLower, thirdTransform]} />
  </View>;
}

function mobileMetrics(width: number): { readonly controlHeight: number; readonly heroHeight: number; readonly heroPaddingTop: number; readonly heroTitleSize: number; readonly horizontalPadding: number; readonly loginTitleSize: number } {
  if (width <= 380) return { controlHeight: 52, heroHeight: 325, heroPaddingTop: 28, heroTitleSize: 34, horizontalPadding: 20, loginTitleSize: 35 };
  return { controlHeight: 56, heroHeight: 350, heroPaddingTop: 28, heroTitleSize: 38, horizontalPadding: 24, loginTitleSize: 39 };
}

function titleFor(mode: Mode): string { return ({ "sign-in": "Bienvenido de nuevo", register: "Crea tu cuenta", "verify-registration": "Confirma tu correo", "request-recovery": "Recupera tu acceso", "verify-recovery": "Ingresa el código", "complete-recovery": "Nueva contraseña" })[mode]; }
function descriptionFor(mode: Mode): string { return ({ "sign-in": "Ingresa para continuar administrando tu empresa.", register: "Empieza a gestionar tu negocio desde cualquier lugar.", "verify-registration": `Enviamos un código de 8 dígitos a ${emailLabel()}.`, "request-recovery": "Te enviaremos un código para recuperar tu cuenta.", "verify-recovery": "Revisa tu correo e ingresa el código de 8 dígitos.", "complete-recovery": "Elige una contraseña segura para tu cuenta." })[mode]; }
function emailLabel(): string { return "tu correo"; }
function actionFor(mode: Mode): string { return ({ "sign-in": "Continuar", register: "Crear cuenta", "verify-registration": "Confirmar correo", "request-recovery": "Enviar código", "verify-recovery": "Verificar código", "complete-recovery": "Guardar contraseña" })[mode]; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { backgroundColor: "#FFFFFF", padding: 0 },
  content: { flexGrow: 1, minHeight: "100%" },
  hero: { backgroundColor: "#E93A0C", overflow: "hidden" },
  blobCanvas: { ...StyleSheet.absoluteFillObject, overflow: "hidden" }, blob: { borderRadius: 999, filter: "blur(20px)", position: "absolute" },
  blobLeft: { backgroundColor: "#FFA580", height: 220, left: -145, opacity: 0.35, top: 55, width: 270 },
  blobRight: { backgroundColor: "#4A0A00", bottom: -130, height: 260, opacity: 0.43, right: -190, width: 330 },
  blobLower: { backgroundColor: "#FFFFFF", filter: "blur(27px)", height: 140, opacity: 0.08, right: 25, top: 30, width: 180 },
  pattern: { ...StyleSheet.absoluteFillObject, opacity: 0.035 }, patternLine: { backgroundColor: "#FFFFFF", position: "absolute" },
  patternHorizontalOne: { height: 1, left: 0, right: 0, top: 145 }, patternHorizontalTwo: { height: 1, left: 0, right: 0, top: 290 },
  patternVerticalOne: { bottom: 0, left: 145, top: 0, width: 1 }, patternVerticalTwo: { bottom: 0, left: 290, top: 0, width: 1 },
  heroContent: { alignSelf: "center", maxWidth: 480, width: "100%" },
  brand: { alignItems: "flex-end", flexDirection: "row" },
  brandName: { color: "#FFFFFF", fontSize: 27, fontWeight: "800", letterSpacing: -1.4, lineHeight: 28 },
  brandDot: { color: "#FF6C4B", fontSize: 27, fontWeight: "800", lineHeight: 28 },
  heroCopy: { marginTop: 62 }, heroEyebrow: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "500", lineHeight: 12, marginBottom: 15 },
  heroHeading: { color: "#FFFFFF", fontWeight: "400", letterSpacing: -2.1, maxWidth: 325 }, heroTitleDot: { color: "#FF7658" },
  heroDescription: { color: "rgba(255,255,255,0.77)", fontSize: 13, lineHeight: 21.45, marginTop: 18, maxWidth: 340 },
  formPanel: { backgroundColor: "#FFFFFF", flex: 1, minHeight: 430, paddingBottom: 32, paddingTop: 38 },
  panelContent: { alignSelf: "center", maxWidth: 440, width: "100%" },
  backButton: { alignItems: "center", height: 40, justifyContent: "center", marginBottom: 8, marginLeft: -9, width: 40 },
  loginBrand: { color: "#545D73", fontSize: 13, fontWeight: "800", letterSpacing: -0.25, lineHeight: 13, marginBottom: 14 }, loginBrandDot: { color: nativeTheme.color.primary },
  loginTitle: { color: "#0C1020", fontWeight: "400", letterSpacing: -2.2, maxWidth: 340 },
  loginDescription: { color: "#667087", fontSize: 13, lineHeight: 20.8, marginTop: 15, maxWidth: 340 },
  formArea: { gap: 21, marginTop: 36 },
  fields: { gap: 22 }, fieldLink: { color: nativeTheme.color.primary, fontSize: 11, fontWeight: "700" },
  remember: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 9 }, checkbox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#D4D9E2", borderRadius: 6, borderWidth: 1, height: 20, justifyContent: "center", width: 20 }, checkboxChecked: { backgroundColor: nativeTheme.color.primary, borderColor: nativeTheme.color.primary }, rememberText: { color: "#566075", fontSize: 12 },
  eyeButton: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  centerLink: { color: nativeTheme.color.primary, fontSize: 15, fontWeight: "700", textAlign: "center" },
  register: { alignItems: "center", marginTop: 23 }, footerText: { color: "#70788B", fontSize: 11, lineHeight: 16, textAlign: "center" }, footerLink: { color: nativeTheme.color.primary, fontSize: 11, fontWeight: "700", lineHeight: 16 },
  mobileFooter: { borderTopColor: "#F0F1F3", borderTopWidth: 1, marginTop: 46, paddingTop: 22 }, footerTitle: { color: "#9BA1AD", fontSize: 10, marginBottom: 15, textAlign: "center" }, footerBadges: { alignItems: "center", flexDirection: "row", gap: 30, justifyContent: "center" }, footerBadge: { color: "#8A91A0", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
});
