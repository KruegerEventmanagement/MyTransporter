export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>MyTransporter · Seite konnte nicht geladen werden</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fff; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
      .card { max-width: 24rem; width: 100%; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #555; margin: 0 0 1.25rem; }
      .actions { display: grid; gap: 0.5rem; }
      a, button { min-height: 48px; border-radius: 999px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid #111; display: grid; place-items: center; }
      .primary { background: #000; color: #fff; }
      .secondary { background: #fff; color: #111; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Die Seite konnte nicht geladen werden</h1>
      <p id="msg">Bitte versuche es gleich noch einmal. Deine Buchungen und Daten sind sicher gespeichert.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Erneut versuchen</button>
        <a class="secondary" href="/">Zur Startseite</a>
      </div>
    </div>
    <script>
      if (navigator.onLine === false) document.getElementById("msg").textContent = "Keine Internetverbindung. Bitte prüfe dein Netz und versuche es erneut.";
      window.addEventListener("online", function () { location.reload(); });
    </script>
  </body>
</html>`;
}
