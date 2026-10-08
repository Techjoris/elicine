(function() {
        try {
          var t = localStorage.getItem('elicine-theme');
          if (t === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            // Mode clair par défaut pour tous les nouveaux visiteurs
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
        } catch (e) {}
      })();

      // Capture immédiate du prompt d'installation PWA dès le chargement du document
      window.deferredPrompt = null;
      window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        window.deferredPrompt = e;
        window.deferredPWAInstallPrompt = e;
        window.dispatchEvent(new Event('pwa-install-ready'));
      });
      window.addEventListener('appinstalled', function() {
        window.deferredPrompt = null;
        window.deferredPWAInstallPrompt = null;
        window.dispatchEvent(new Event('pwa-installed'));
      });
