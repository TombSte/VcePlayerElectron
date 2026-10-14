/**
 * Renders build/icon.png (1024x1024) used by electron-builder to generate the
 * macOS (.icns) and Windows (.ico) application icons.
 *
 * Usage: npx electron scripts/make-icon.cjs
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..')
const BUILD = path.join(ROOT, 'build')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent}
  .icon{width:1024px;height:1024px;display:grid;place-items:center;
    background:linear-gradient(140deg,#2563eb,#1d4ed8 55%,#1e3a8a);
    border-radius:220px}
  .badge{width:660px;height:660px;border-radius:170px;background:rgba(255,255,255,0.14);
    border:14px solid rgba(255,255,255,0.55);display:grid;place-items:center;
    box-shadow:0 40px 120px rgba(0,0,0,0.35)}
  .text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-weight:800;font-size:260px;letter-spacing:-8px;color:#fff;text-align:center;line-height:1}
  .sub{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-weight:600;font-size:74px;letter-spacing:22px;color:rgba(255,255,255,0.85);margin-top:24px}
</style></head><body>
  <div class="icon"><div class="badge"><div><div class="text">VCE</div><div class="sub">PLAYER</div></div></div></div>
</body></html>`

app.whenReady().then(async () => {
  fs.mkdirSync(BUILD, { recursive: true })
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  fs.writeFileSync(path.join(BUILD, 'icon.png'), image.toPNG())
  console.log('wrote build/icon.png')
  win.destroy()
  app.exit(0)
})
