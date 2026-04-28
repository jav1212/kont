// notify.ts — single entry point for user-facing notifications.
//
// Usage:
//   notify.error("No se pudo guardar el empleado.");
//   notify.success("Recibo exportado a PDF.");
//   notify.warning("Sin permisos para editar; modo lectura.");
//   notify.info("Se aplicó el tipo de cambio del BCV.");
//   notify.promise(saveEmployee(), {
//       loading: "Guardando…",
//       success: "Empleado guardado.",
//       error:   "No se pudo guardar el empleado.",
//   });
//
// Rules:
//   - error    → fallos de API, submits inválidos, operaciones canceladas.
//   - success  → confirmaciones de acciones (guardar, eliminar, exportar).
//   - warning  → estados límite (datos parciales, permisos reducidos).
//   - info     → cambios neutrales sin acción del usuario.
//   - Nunca renderizar errores en divs/JSX. Siempre via `notify.*`.
//   - Validación de campo en tiempo real (onChange) NO usa toast — el
//     border `isInvalid` del input es suficiente; el toast aparece al submit.
//
// Implementation: thin wrapper over `sonner`. The Toaster is mounted once in
// app/layout.tsx so this works from anywhere (hooks, handlers, repos, etc.)
// without provider boilerplate.

import { toast } from "sonner";

export interface NotifyOpts {
    description?: string;
    duration?:    number;
    id?:          string | number;
}

export const notify = {
    error:   (message: string, opts?: NotifyOpts) => toast.error(message, opts),
    success: (message: string, opts?: NotifyOpts) => toast.success(message, opts),
    warning: (message: string, opts?: NotifyOpts) => toast.warning(message, opts),
    info:    (message: string, opts?: NotifyOpts) => toast.info(message, opts),

    promise: <T>(
        p: Promise<T>,
        msgs: {
            loading: string;
            success: string | ((value: T) => string);
            error:   string | ((err:   unknown) => string);
        },
    ) => toast.promise(p, msgs),

    dismiss: (id?: string | number) => toast.dismiss(id),
} as const;
