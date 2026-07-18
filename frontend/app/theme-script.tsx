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

              var path = location.pathname || '';
              var isAuth =
                path === '/login' ||
                path.indexOf('/login/') === 0 ||
                path === '/register';

              // Auth pages always render light so form copy stays readable
              // after signing out from dark mode.
              if (isAuth) {
                root.classList.add('perfex');
                return;
              }

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
