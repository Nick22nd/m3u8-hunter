/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electron: {
    sendMsg: (msg: Message4Renderer) => Promise<Message4Renderer>
    onReplyMsg: (cb: (msg: Message4Renderer) => any) => void
  }
}
