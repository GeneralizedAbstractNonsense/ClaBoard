# ClaBoard

Lavagna digitale multipagina per scrivere, disegnare e presentare lezioni. Include penne e gomma, forme, grafici interattivi, importazione di immagini e PDF, esportazione PDF, strumenti geometrici, calcolatrice scientifica e registrazione della sessione.

## Usa la versione Web

[Apri ClaBoard nel browser](https://generalizedabstractnonsense.github.io/ClaBoard/)

La versione web viene pubblicata su GitHub Pages a ogni aggiornamento del branch `main`. Per la prima pubblicazione, imposta **Settings → Pages → Build and deployment → Source: GitHub Actions** nel repository.

## Download desktop

Scarica l'ultima versione dalla [pagina Releases](https://github.com/GeneralizedAbstractNonsense/ClaBoard/releases):

- [macOS — Apple Silicon e Intel](https://github.com/GeneralizedAbstractNonsense/ClaBoard/releases/latest)
- [Windows — installer](https://github.com/GeneralizedAbstractNonsense/ClaBoard/releases/latest)
- [Linux — AppImage e pacchetto DEB](https://github.com/GeneralizedAbstractNonsense/ClaBoard/releases/latest)

Le build desktop vengono generate per macOS, Windows e Linux quando viene pubblicato un tag `v*`. Nella pagina della release scegli l'installer corrispondente al tuo sistema.

## Sviluppo locale

```sh
npm ci
npm run dev
```

Per creare il bundle web usa `npm run build`; per generare il pacchetto desktop della piattaforma corrente usa `npm run tauri:build`.
