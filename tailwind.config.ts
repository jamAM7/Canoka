import type { Config } from "tailwindcss";

const config: Config = {
  // Files Tailwind will scan for class names. Keep this list up-to-date
  // when adding new folders or file types so unused styles are purged.
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./styles/**/*.css",
  ],
  // Centralized design tokens. These values are referenced throughout the
  // app via Tailwind utilities (e.g. `text-primary`, `bg-surface`, `p-4`).
  // Update here to keep styling consistent across components.
  theme: {
    extend: {
      // Color palette (semantic + brand). Prefer semantic names in
      // components (primary, surface, border) so tokens can swap easily.
      colors: {
        primary: "#023047",
        "primary-light": "#8ECAE6",
        "primary-dark": "#012536",
        secondary: "#FFB703",
        "secondary-dark": "#FB8500",
        accent: "#E26D5C",
        "accent-muted": "#C9CBA3",
        success: "#5F8A62",
        warning: "#FFB703",
        error: "#C94C4C",
        info: "#8ECAE6",
        text: "#0C0C20",
        "text-muted": "#62626D",
        "text-light": "#8A8A92",
        background: "#F6FAF9",
        surface: "#FFFFFF",
        "surface-muted": "#EEF3F3",
        border: "#D9DFDF",
        "border-light": "#E8ECEC",
        white: "#FFFFFF",
        black: "#0C0C20",
        brand: "#023047",
        brandSoft: "#8ECAE6",
        brandDeep: "#012536",
        shell: "#F6FAF9",
        panel: "#FFFFFF",
        panelMuted: "#EEF3F3",
        ink: "#0C0C20",
        inkMuted: "#62626D",
        inkLight: "#8A8A92",
        line: "#D9DFDF",
        lineSoft: "#E8ECEC",
      },
      spacing: {
        // Common spacing scale used across layouts and components. Add
        // descriptive tokens (e.g. `sidebar`, `navbar`) for fixed dims.
        1: "0.25rem",
        2: "0.5rem",
        3: "0.75rem",
        4: "1rem",
        5: "1.25rem",
        6: "1.5rem",
        8: "2rem",
        10: "2.5rem",
        12: "3rem",
        16: "4rem",
        20: "5rem",
        sidebar: "240px",
        navbar: "72px",
      },
      fontFamily: {
        // We use the Karla variable injected by next/font. Keep only
        // Karla + a generic fallback to avoid unexpected font swaps.
        sans: ["var(--font-karla)", "Karla", "sans-serif"],
        body: ["var(--font-karla)", "Karla", "sans-serif"],
        heading: ["var(--font-karla)", "Karla", "sans-serif"],
      },
      fontSize: {
        // Font-size scale (value + line-height). Use `text-sm`, `text-lg` etc.
        xs: ["0.75rem", { lineHeight: "1.2" }],
        sm: ["0.875rem", { lineHeight: "1.4" }],
        base: ["1rem", { lineHeight: "1.5" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.375rem", { lineHeight: "1.2" }],
        "2xl": ["1.75rem", { lineHeight: "1.2" }],
        "3xl": ["2.25rem", { lineHeight: "1.2" }],
        "4xl": ["3rem", { lineHeight: "1.2" }],
      },
      fontWeight: {
        // Named font-weights to use via `font-regular`, `font-medium` etc.
        regular: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      lineHeight: {
        // Helpful semantic line-heights for body and headings.
        tight: "1.2",
        normal: "1.5",
        relaxed: "1.7",
      },
      borderRadius: {
        // Border radius scale. Use descriptive names like `md` or `pill`.
        sm: "5px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "999px",
      },
      boxShadow: {
        // Reusable shadows: `shadow-sm`, `shadow-md`, `shadow-focus`.
        sm: "0 1px 2px rgba(2, 48, 71, 0.06)",
        md: "0 4px 12px rgba(2, 48, 71, 0.08)",
        lg: "0 10px 25px rgba(2, 48, 71, 0.12)",
        focus: "0 0 0 3px rgba(142, 202, 230, 0.45)",
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0em",
        wide: "0.12em",
      },
      maxWidth: {
        app: "1440px",
        reading: "760px",
      },
      minHeight: {
        input: "44px",
        button: "44px",
      },
      height: {
        input: "44px",
        button: "44px",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "220ms",
        slow: "350ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease",
        fast: "ease",
        smooth: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        normal: "ease",
      },
      screens: {
        // Breakpoints used for responsive utilities (mobile → desktop).
        mobile: "640px",
        tablet: "900px",
        desktop: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
