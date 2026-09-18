# Lectura HID en el POS Web

Con dispositivos habilitados y una suscripción de productos activa, la Web
reconoce lecturas USB tipo teclado mientras la página está visible y tiene foco.
Para productos, reconoce secuencias de 4 a 128 caracteres terminadas en Intro,
con intervalos de hasta 50 ms, incluido el Intro final.

La captura utiliza `event.timeStamp`: mide cuándo se generaron los eventos,
no cuándo se ejecutaron sus manejadores. Así, una pausa de procesamiento no
fragmenta por sí sola una ráfaga cuyos eventos mantienen esos intervalos.

Al reconocer una lectura, restaura el valor previo del `input` o `textarea`
que sigue conectado y sincroniza su estado React antes de entregar el código.
Restaura también la selección cuando el campo la admite. Consume el Intro
reconocido para evitar que active además la búsqueda o confirme un precio manual.
Cambiar de destino, perder el foco de la ventana o cambiar su visibilidad
descarta la captura pendiente.

En el POS, un código registrado abre la consulta de precio. El foco queda
dentro de la consulta sin mantener el buscador enfocado; si falta precio,
pasa al campo de precio temporal. Repetir la lectura del mismo producto
conserva el precio temporal en edición. Al cerrar una consulta iniciada por
escaneo, el foco vuelve al contenedor del POS; una consulta iniciada manualmente
devuelve el foco al buscador.

La detección HID es una heurística temporal: no identifica físicamente qué
dispositivo produjo las teclas. Una escritura humana suficientemente rápida
puede clasificarse como lectura. Un escaneo realmente lento o interrumpido
puede dejar texto o fragmentos en el campo, o reconocer sólo un sufijo rápido.
Los caracteres pueden llegar al campo antes del Intro; la restauración no
garantiza revertir efectos secundarios ya ejecutados. No cubre `contenteditable`.

No hay bloqueo global del teclado. La captura actúa dentro de la página y
consume únicamente el Intro de una lectura reconocida; no bloquea las teclas
de caracteres ni impide escribir en otras aplicaciones.

Los códigos de producto conservan la distribución activa del teclado. El
tratamiento de carnets se documenta en
[Seguridad y operación del acceso por carnet](../security/web-barcode-access.md).

Implementación: [captura y restauración](../../src/shared/frontend/devices/device-manager-provider.tsx),
[reconocedor](../../src/shared/frontend/devices/keyboard-wedge-scanner.ts) y
[pantalla POS](../../src/modules/sales/frontend/components/pos-sale-screen.tsx).

Regresión de navegador: usa componentes React reales de producción con datos de fixture; no certifica hardware.
Requiere las dependencias de `tooling/ui-smoke` y Edge instalado. Desde la raíz, en PowerShell:
```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
node --test test/barcode-pos-browser.test.mjs
```
Se ejecuta por separado: `test:barcode` excluye archivos `.mjs`.
