import type { Metadata } from 'next'
import { VT323, Press_Start_2P, Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const vt323 = VT323({ 
  weight: '400',
  subsets: ["latin"],
  variable: '--font-vt323',
  display: 'swap',
});

const pressStart = Press_Start_2P({ 
  weight: '400',
  subsets: ["latin"],
  variable: '--font-pixel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'E-Reader Book Manager',
  description: 'Retro pixel-art e-reader file management system',


  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'E-Reader',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${vt323.variable} ${pressStart.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {})
              }
              const style = document.createElement('style')
              style.textContent = '[id*="nextjs-dev-tools"], nextjs-dev-tools, nextjs-portal { display: none !important }'
              document.head.appendChild(style)
            `,
          }}
        />
      </body>
    </html>
  )
}
