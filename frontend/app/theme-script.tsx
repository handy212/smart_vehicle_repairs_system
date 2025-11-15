export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              const stored = localStorage.getItem('theme');
              const theme = stored || 'system';
              const root = document.documentElement;

              const apply = (isDark) => {
                root.classList[isDark ? 'add' : 'remove']('dark');
              };

              if (theme === 'dark') {
                apply(true);
              } else if (theme === 'system') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                apply(isDark);
              } else {
                apply(false);
              }
            } catch (_) {}
          })();
        `,
      }}
    />
  );
}
