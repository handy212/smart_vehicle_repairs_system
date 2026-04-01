export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              const stored = localStorage.getItem('theme');
              const theme = stored || 'light';
              const root = document.documentElement;
              root.classList.remove('dark', 'classic', 'perfex');

              if (theme === 'dark') {
                root.classList.add('dark');
              } else if (theme === 'classic') {
                root.classList.add('classic');
              } else if (theme === 'perfex') {
                root.classList.add('perfex');
              } else if (theme === 'system') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (isDark) root.classList.add('dark');
              }
            } catch (_) {}
          })();
        `,
      }}
    />
  );
}
