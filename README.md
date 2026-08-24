# Ship Navigation Game

A small top-down 2D navigation prototype built with Vite and TypeScript.

## Run locally

```sh
npm install
npm run dev
```

Press `Space` to start. Use the left and right arrow keys to steer the boat through the continuously scrolling chart without touching land. Press the reset button after a crash.

## Build

```sh
npm run build
```

## Windows application

This project includes Electron packaging for a normal Windows installer. Push the project to a GitHub repository, then open the **Build Windows application** workflow under **Actions** and run it, or push to any branch to start it automatically. Download the `ship-navigation-game-windows` artifact from the completed workflow; it contains the `.exe` installer.

The installer creates a Start Menu entry and desktop shortcut. Windows users do not need Node.js or development tools installed.
