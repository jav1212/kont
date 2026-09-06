import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Button } from "./button";
import { Heading } from "./typography";
import { useUiTheme } from "./theme";

interface ModalSurfaceProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Provides native modal dismissal, keyboard avoidance and bounded scrolling.
 * @param props - Dialog title, controlled visibility, content and close callback.
 * @returns A modal subtree; dismissing never changes a selected value.
 */
export function ModalSurface({
  children,
  title,
  open,
  onClose,
}: ModalSurfaceProps) {
  const { colors } = useUiTheme();
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            accessible={false}
            onPress={onClose}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              maxHeight: "90%",
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Heading level={2} style={{ flex: 1 }}>
                {title}
              </Heading>
              <Button
                appearance="text"
                accessibilityLabel={`Cerrar ${title}`}
                onPress={onClose}
              >
                Cerrar
              </Button>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12 }}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
