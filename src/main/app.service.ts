import fs from 'node:fs'
import { join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { Parser } from 'm3u8-parser'
import download from 'download'

// import { jsondb } from './lib/jsondb'

interface BrowserVideoItem {
  headers: string
  type: string
  url: string
}
@Injectable()
export class AppService {
  storagePath = '/Users/nick22nd/fromGit/m3u8-hunter/tmp/download'
  httpTimeout = {
    socket: 30000,
    request: 30000,
    response: 60000,
  }

  public getTime(): number {
    return new Date().getTime()
  }

  // download m3u8
  public async downloadM3u8(videoItem: BrowserVideoItem, targetPath = this.storagePath) {
    const m3u8Url = videoItem.url
    const headers = videoItem.headers
    const sampleFilename = new URL(m3u8Url).pathname.split('/').pop()
    if (!fs.existsSync(targetPath)) {
      console.log('targetPath', targetPath)
      fs.mkdirSync(targetPath, { recursive: true })
    }

    try {
      if (fs.existsSync(join(targetPath, sampleFilename))) {
        console.log('file exists')
        analyseM3u8File(targetPath, sampleFilename)
      }
      else {
        console.log('start download')

        await downloadFile(m3u8Url, targetPath, headers)
      }
    }
    catch (err) {
      console.log('err', err)
    }
  }
}

async function downloadFile(url: string, targetPath: string, headers: string) {
  // const stream = got.stream(url)
  // name = name || new URL(url).pathname.split('/').pop()
  // console.log('name', name)
  // console.log(targetPath, name)
  // const writer = fs.createWriteStream(join(targetPath, name))

  // stream.pipe(writer)
  // return new Promise((resolve, reject) => {
  //   writer.on('finish', resolve)
  //   writer.on('error', reject)
  // })
  const _headers = JSON.parse(headers)
  // try {
  //   // jsondb.init()
  //   await jsondb.update({
  //     url,
  //     headers: _headers,
  //     status: 'downloading',
  //   })
  // }
  // catch (error) {
  //   console.log('error', error)
  // }
  return download(url, targetPath, {
    // filename: name,
    timeout: this.httpTimeout,
    headers: _headers,
  })
}
function timeFormat(streamDuration: number) {
  const hours = Math.floor(streamDuration / 3600)
  const minutes = Math.floor((streamDuration - hours * 3600) / 60)
  const seconds = Math.floor(streamDuration - hours * 3600 - minutes * 60)
  const str = [hours, minutes, seconds].map((item) => {
    return item.toString().padStart(2, '0')
  }).join(':')
  return str
}
function analyseM3u8File(targetPath: string, sampleFilename: string) {
  const str = fs.readFileSync(join(targetPath, sampleFilename), 'utf8')
  const parser = new Parser()
  parser.push(str)
  console.log(parser.manifest)
  const { segments } = parser.manifest
  let streamDuration = 0
  streamDuration = segments.reduce((acc, cur) => {
    return acc + cur.duration
  }, 0)
  console.log('streamDuration: ', streamDuration, timeFormat(streamDuration))
  console.log(parser)
}
