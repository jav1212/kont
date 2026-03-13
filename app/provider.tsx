'use client'

import { HeroUIProvider }  from '@heroui/react'
import { useRouter }        from 'next/navigation'
import { ThemeProvider }    from '@/src/shared/frontend/components/theme-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <ThemeProvider>
      <HeroUIProvider navigate={router.push}>
        {children}
      </HeroUIProvider>
    </ThemeProvider>
  )
}