<p align="center">
  <a href="https://impactr.dev">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Impactr logo">
    </picture>
  </a>
</p>
<p align="center">El agente de programación con IA de código abierto.</p>
<p align="center">
  <a href="https://impactr.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/impactr-ai"><img alt="npm" src="https://img.shields.io/npm/v/impactr-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/impactr/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/impactr/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![Impactr Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://impactr.dev)

---

### Instalación

```bash
# YOLO
curl -fsSL https://impactr.dev/install | bash

# Gestores de paquetes
npm i -g impactr-ai@latest        # o bun/pnpm/yarn
scoop install impactr             # Windows
choco install impactr             # Windows
brew install anomalyco/tap/impactr # macOS y Linux (recomendado, siempre al día)
brew install impactr              # macOS y Linux (fórmula oficial de brew, se actualiza menos)
sudo pacman -S impactr            # Arch Linux (Stable)
paru -S impactr-bin               # Arch Linux (Latest from AUR)
mise use -g impactr               # cualquier sistema
nix run nixpkgs#impactr           # o github:anomalyco/impactr para la rama dev más reciente
```

> [!TIP]
> Elimina versiones anteriores a 0.1.x antes de instalar.

### App de escritorio (BETA)

Impactr también está disponible como aplicación de escritorio. Descárgala directamente desde la [página de releases](https://github.com/anomalyco/impactr/releases) o desde [impactr.dev/download](https://impactr.dev/download).

| Plataforma            | Descarga                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `impactr-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `impactr-desktop-mac-x64.dmg`     |
| Windows               | `impactr-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, o AppImage         |

```bash
# macOS (Homebrew)
brew install --cask impactr-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/impactr-desktop
```

#### Directorio de instalación

El script de instalación respeta el siguiente orden de prioridad para la ruta de instalación:

1. `$IMPACTR_INSTALL_DIR` - Directorio de instalación personalizado
2. `$XDG_BIN_DIR` - Ruta compatible con la especificación XDG Base Directory
3. `$HOME/bin` - Directorio binario estándar del usuario (si existe o se puede crear)
4. `$HOME/.impactr/bin` - Alternativa por defecto

```bash
# Ejemplos
IMPACTR_INSTALL_DIR=/usr/local/bin curl -fsSL https://impactr.dev/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://impactr.dev/install | bash
```

### Agentes

Impactr incluye dos agentes integrados que puedes alternar con la tecla `Tab`.

- **build** - Por defecto, agente con acceso completo para tareas de desarrollo
- **plan** - Agente de solo lectura para análisis y exploración de código
  - Deniega ediciones de archivos por defecto
  - Pide permiso antes de ejecutar comandos bash
  - Ideal para explorar codebases desconocidas o planificar cambios

Además, incluye un subagente **general** para búsquedas complejas y tareas de varios pasos.
Se usa internamente y se puede invocar con `@general` en los mensajes.

Más información sobre [agentes](https://impactr.dev/docs/agents).

### Documentación

Para más información sobre cómo configurar Impactr, [**ve a nuestra documentación**](https://impactr.dev/docs).

### Contribuir

Si te interesa contribuir a Impactr, lee nuestras [docs de contribución](./CONTRIBUTING.md) antes de enviar un pull request.

### Proyectos basados en Impactr

Si estás trabajando en un proyecto basado en Impactr y usas "impactr" como parte del nombre, por ejemplo, "impactr-dashboard" u "impactr-mobile", agrega una nota en tu README para aclarar que no está hecho por el equipo de Impactr y que no está afiliado con nosotros de ninguna manera.

---

**Únete a nuestra comunidad** [Discord](https://discord.gg/impactr) | [X.com](https://x.com/impactr)
