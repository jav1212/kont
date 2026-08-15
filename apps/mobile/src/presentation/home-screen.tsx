import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Heading, Screen, Text, nativeTheme } from "@kontave/ui-native";
import { useAuth } from "../auth/auth-context";
import { MobileWorkspaceProvider, useMobileWorkspace } from "../workspace/mobile-workspace";

export function AuthenticatedHome(): React.JSX.Element { return <MobileWorkspaceProvider><HomeContent /></MobileWorkspaceProvider>; }

function HomeContent(): React.JSX.Element {
  const auth = useAuth(); const workspace = useMobileWorkspace();
  if (workspace.state.status === "loading") return <Screen style={styles.center}><ActivityIndicator size="large" color={nativeTheme.color.primary} /></Screen>;
  if (workspace.state.status === "unavailable") return <Screen style={styles.center}><Heading>Sin conexión</Heading><Text>No pudimos cargar tu espacio de trabajo.</Text><Button label="Reintentar" onPress={() => { void workspace.refresh(); }} /><Button intent="neutral" label="Cerrar sesión" onPress={() => { void auth.signOut(); }} /></Screen>;
  const { context, companies, employees, employeesLoading, selectedCompanyId, user } = workspace.state;
  const authenticatedEmail = auth.state.status === "authenticated" ? auth.state.user.email : null;
  return <Screen style={styles.flush}><ScrollView contentContainerStyle={styles.content}>
    <View><Text style={styles.eyebrow}>ESPACIO DE TRABAJO</Text><Heading>{context.active?.name ?? "Kontave"}</Heading><Text style={styles.muted}>{user?.displayName ?? user?.email ?? authenticatedEmail ?? ""}</Text></View>
    {context.portfolio.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceRow}>{context.portfolio.map((item) => <Pressable key={item.organizationId} onPress={() => { void workspace.select(item.organizationId); }} style={[styles.workspacePill, item.organizationId === context.active?.organizationId && styles.workspacePillActive]}><Text>{item.name}</Text></Pressable>)}</ScrollView> : null}
    <View style={styles.section}><Heading style={styles.sectionTitle}>Empresas</Heading>{companies.length === 0 ? <Card><Text>No hay empresas operativas en este espacio.</Text></Card> : companies.map((company) => <Pressable key={company.id} onPress={() => { void workspace.selectCompany(company.id); }}><Card style={selectedCompanyId === company.id ? styles.selectedCard : undefined}><Text style={styles.companyName}>{company.name}</Text><Text style={styles.muted}>{company.rif ?? "Sin RIF registrado"}</Text></Card></Pressable>)}</View>
    {selectedCompanyId ? <View style={styles.section}><Heading style={styles.sectionTitle}>Empleados</Heading>{employeesLoading ? <ActivityIndicator color={nativeTheme.color.primary} /> : employees.length === 0 ? <Card><Text>No hay empleados disponibles o el módulo de nómina no está activo.</Text></Card> : employees.map((employee) => <Card key={employee.id}><Text style={styles.companyName}>{employee.fullName}</Text><Text style={styles.muted}>{employee.position} · {employee.status}</Text></Card>)}</View> : null}
    <Button intent="neutral" label="Cerrar sesión" onPress={() => { void auth.signOut(); }} />
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ flush: { padding: 0 }, content: { gap: nativeTheme.space.xl, padding: nativeTheme.space.xl }, center: { alignItems: "center", justifyContent: "center", gap: nativeTheme.space.lg }, eyebrow: { color: nativeTheme.color.primary, fontSize: 12, fontWeight: "800", letterSpacing: 1 }, muted: { color: nativeTheme.color.muted }, workspaceRow: { gap: nativeTheme.space.sm }, workspacePill: { backgroundColor: nativeTheme.color.surface, borderColor: nativeTheme.color.border, borderRadius: nativeTheme.radius.full, borderWidth: 1, paddingHorizontal: nativeTheme.space.lg, paddingVertical: nativeTheme.space.sm }, workspacePillActive: { backgroundColor: nativeTheme.color.primarySoft, borderColor: nativeTheme.color.primary }, section: { gap: nativeTheme.space.md }, sectionTitle: { fontSize: 22 }, companyName: { fontWeight: "700" }, selectedCard: { borderColor: nativeTheme.color.primary, backgroundColor: nativeTheme.color.primarySoft } });
