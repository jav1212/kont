import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function RootHtml({ children }: PropsWithChildren): React.JSX.Element {
  return <html lang="es">
    <head>
      <meta charSet="utf-8" />
      <meta content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" name="viewport" />
      <ScrollViewStyleReset />
      <style dangerouslySetInnerHTML={{ __html: `html,body,#root,#root>div{box-sizing:border-box;margin:0;padding:0;width:100%;height:100%;min-height:100%;background:#fff;overflow-x:hidden}body,#root,#root>div{min-height:100dvh}` }} />
    </head>
    <body>{children}</body>
  </html>;
}
