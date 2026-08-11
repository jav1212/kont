'use client'

import { HeroUIProvider }  from '@heroui/react'
import { useRouter }        from 'next/navigation'
import { ThemeProvider }    from '@/src/shared/frontend/components/theme-provider'
import { DeviceManagerProvider } from '@/src/shared/frontend/devices/device-manager-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <ThemeProvider>
      <HeroUIProvider navigate={router.push}>
        <DeviceManagerProvider>
          {children}
        </DeviceManagerProvider>
      </HeroUIProvider>
    </ThemeProvider>
  )
}
