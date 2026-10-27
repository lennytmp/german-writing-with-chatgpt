# Deutsche Schicksalsprobe

Ein lokales Schreibspiel zum Deutschüben mit Gesundheit, Erfahrungspunkten, Leveln, Spielklängen und KI-Korrekturen direkt im Spiel.

## Starten

Unter Windows „Spiel starten.vbs“ doppelklicken. Alternativ „Start-Spiel.cmd“ öffnen.
Der Startknopf öffnet ein eigenes Spielfenster. Nicht die index.html direkt öffnen.

Voraussetzungen: Node.js ab Version 20, ein installierter Codex-Client und eine Anmeldung mit dem eigenen ChatGPT-Konto.
Falls die Anmeldung fehlt, einmal im Terminal `codex login` ausführen.
Die KI-Prüfung benötigt Internet und nutzt das Codex-Kontingent des angemeldeten ChatGPT-Kontos. Ein separater API-Schlüssel ist nicht nötig.

Alternativ im Projektordner `npm start` ausführen und http://127.0.0.1:8787 öffnen. Es sind keine zusätzlichen npm-Pakete erforderlich.

## Schreiben ohne Wartepause

Mit **Text einreihen** oder Strg+Enter schickst du einen Text ab und kannst sofort weiterschreiben. Jeder Text bekommt eine eigene Nummer und Ergebniskarte. Eine KI-Prüfung läuft jeweils im Hintergrund; weitere Texte warten sichtbar in der Warteschlange.

Korrekturen öffnest du direkt an der passenden Karte. Dein freier Entwurf bleibt dabei erhalten. Ergebnisse ändern weder deinen aktuellen Text noch den Eingabefokus. Einzelne Aufträge lassen sich abbrechen. Bei Anmelde- oder Kontingentproblemen pausiert die Prüfung; du kannst weiterhin Texte einreihen und später fortsetzen.

Entwürfe, offene Korrekturen und die Warteschlange werden automatisch gespeichert und in JSON-Sicherungen aufgenommen. Unterbrochene Prüfungen werden beim nächsten Öffnen erneut eingereiht. Ältere Spielstandsicherungen bleiben lesbar.

## Spielcode und Spielstand sichern

Diese zwei Sicherungen sind unabhängig:

- **Spielcode:** Der gesamte Projektordner lässt sich in einem GitHub-Repository sichern. Nach späteren Änderungen erneut committen und hochladen.
- **Spielstand:** HP, XP, Texte und Chronik werden automatisch im aktuellen Browser gespeichert. Unter „Chronik der Sätze“ über **Spielstand sichern** eine zusätzliche JSON-Datei herunterladen. Diese Datei separat aufbewahren, beispielsweise in einer eigenen Cloud-Sicherung oder auf einem zweiten Datenträger.
- Zum Wiederherstellen **Spielstand laden** wählen, die JSON-Datei auswählen und die Vorschau bestätigen.
- Eine Sicherung enthält den aktuell gespeicherten Stand einschließlich der bis zu 40 aufbewahrten Chronikeinträge, bis zu 500 gemeisterten Texte, des Textentwurfs, aller offenen Korrekturen und der Warteschlange und der Ton-Einstellung.
- Vor einem Import bleibt der vorherige Stand zusätzlich als Sicherheitskopie im Browser erhalten.
- Nach dem Umzug auf einen anderen Computer Node.js und Codex installieren, mit dem eigenen Konto anmelden und die Spielstanddatei importieren.
- Browserdaten löschen oder einen anderen Browser verwenden kann den lokalen Stand entfernen. Deshalb die JSON-Sicherung regelmäßig aktualisieren.

Das Speichern des Projektordners oder ein GitHub-Upload sichert Browser-Spielstände **nicht automatisch**.
Private Spielstanddateien, Laufzeitprotokolle und Zugangsdaten gehören nicht ins Repository; passende Ausschlüsse stehen in .gitignore.

## Spielregeln

- Fehlerfrei: +15 XP und +5 HP, maximal 100 HP.
- Sichere Sprachfehler: einmalig −15 HP pro neuem Text.
- Erfolgreich überarbeitet: +10 XP, keine Heilung; weitere Korrekturversuche kosten keine zusätzlichen HP.
- Drei neue fehlerfreie Texte heilen zusammen eine Wunde von 15 HP. Korrekturen heilen keine HP.
Bei 0 HP endet der Versuch und die Warteschlange stoppt. „Neuer Versuch“ beginnt mit 100 HP; XP, Texte und Entwürfe bleiben erhalten.
100 XP pro Level. Gemeisterte Texte geben nicht mehrfach Punkte.
- Stilvorlieben und unsichere Bewertungen werden nicht bestraft.
- Ton kann oben ein- und ausgeschaltet werden. Es werden keine Audiodateien heruntergeladen.

## Aufbau und Datenschutz

`server.cjs` stellt die Spieloberfläche lokal bereit und ruft den installierten Codex-Client auf.
`app.js`, `game-state.js`, `index.html` und `style.css` enthalten das Spiel.
`npm test` prüft Warteschlange, Punktevergabe, Wiederherstellung und Eingabeverhalten.
`grammar-instructions.txt` und `grade-schema.json` bestimmen die KI-Prüfung.
Es gibt keine lokalen Regeln zur Beurteilung deutscher Grammatik.

Der lokale Dienst lauscht auf 127.0.0.1:8787. Texte werden zur Prüfung an OpenAI gesendet.
Codex verwaltet die Anmeldung; das Spiel speichert oder kopiert keine Zugangsdaten.
Der Ausschaltknopf im Spiel beendet den lokalen Dienst.
KI-Bewertungen können Fehler enthalten.

## GitHub

Das Repository dient der Sicherung und Versionsverwaltung des Codes. Das Spiel läuft weiterhin lokal.
Am einfachsten zunächst ein privates Repository verwenden. Zugangsdaten und exportierte Spielstände nicht hochladen.
