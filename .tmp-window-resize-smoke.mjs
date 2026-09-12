import { writeFile } from 'node:fs/promises'

const pages = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
const page = pages.find((item) => item.type === 'page')
if (!page) throw new Error('No headless Chrome page found')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const callback = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) callback.reject(new Error(message.error.message))
  else callback.resolve(message.result)
})
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const callId = ++id
    pending.set(callId, { resolve, reject })
    socket.send(JSON.stringify({ id: callId, method, params }))
  })
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

await call('Page.enable')
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__fitCalls = [];
    window.downloads = {
      version: 13,
      fitWindow: async height => { window.__fitCalls.push(height); return { clamped: false } },
      listQueues: async () => [],
      getSegmentCount: async () => 4,
      getCompletedDoubleClickAction: async () => 'open-file',
      onSocialProgress: () => () => {},
      getYouTubeAuthStatus: async () => ({
        mode: 'app-session',
        label: 'Signed in with an isolated session',
        detail: 'The Google/YouTube session is active. Nexus does not read your password or account email.'
      })
    }
  `,
})
const resize = (width, height) =>
  call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
const metrics = () =>
  call('Runtime.evaluate', {
    expression: `JSON.stringify({
      viewport: [innerWidth, innerHeight],
      body: [document.body.scrollWidth, document.body.scrollHeight],
      root: [document.querySelector('#root').clientHeight, document.querySelector('#root').scrollHeight],
      dialog: (() => { const r = document.querySelector('.window-dialog').getBoundingClientRect(); return [r.top, r.bottom, r.height] })(),
      actions: (() => { const r = document.querySelector('.dialog-actions').getBoundingClientRect(); return [r.top, r.bottom] })(),
      overflow: getComputedStyle(document.body).overflowY,
      canScroll: document.body.scrollHeight > innerHeight,
      fitCalls: window.__fitCalls
    })`,
    returnByValue: true,
  }).then((result) => JSON.parse(result.result.value))
const capture = async (path) => {
  const result = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

await resize(570, 560)
await call('Page.navigate', { url: 'http://127.0.0.1:4180/?utilityDialog=youtube' })
await wait(1200)
await resize(850, 675)
await wait(300)
const enlarged = await metrics()
await capture('/tmp/nexus-youtube-enlarged.png')
await resize(570, 380)
await wait(300)
const reduced = await metrics()
await capture('/tmp/nexus-youtube-reduced.png')
console.log(JSON.stringify({ enlarged, reduced }, null, 2))
socket.close()
