import { ThemeProvider as NextThemesProvider } from 'next-themes';

// Light, Dark, or Match my phone ('system': follows the phone's own dark mode;
// testers' report, Nov 2026). New people start on Light.
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
