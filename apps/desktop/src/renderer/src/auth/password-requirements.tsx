import { Check, X } from "lucide-react";
import { evaluatePassword } from "@kontave/auth-domain";
import { Text } from "@kontave/ui-dom";

export function PasswordRequirements({ password }: { readonly password: string }) {
  if (!password) return null;
  return <ul className="password-requirements" aria-label="Requisitos de contraseña">
    {evaluatePassword(password).map((requirement) => <li key={requirement.code} data-satisfied={requirement.satisfied}>
      {requirement.satisfied ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
      <Text tone="inherit">{requirement.label}</Text>
    </li>)}
  </ul>;
}
