export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              const stored = localStorage.getItem('theme');
              const root = document.documentElement;
              root.classList.remove('dark', 'classic', 'perfex');

              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (stored === 'dark' || stored === 'perfex-dark' || (stored === 'system' && prefersDark)) {
                root.classList.add('perfex', 'dark');
              } else {
                root.classList.add('perfex');
              }
            } catch (_) {}
          })();
        `,
      }}
    />
  );
}
