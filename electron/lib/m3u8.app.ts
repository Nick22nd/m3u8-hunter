import fs from 'node:fs'
import { join } from 'node:path'
import { Parser } from 'm3u8-parser'
import download from 'download'
import fsExtra from 'fs-extra'
import { getAppDataDir, timeFormat } from './utils'
import { DialogService } from '../service/dialog.service'
import { TaskItem } from '../common.types'
import async from 'async'

import { jsondb } from './jsondb'
import { dialog } from 'electron'
import Logger from 'electron-log'


export class M3u8Service {
    // static storagePath = getAppDataDir()
    static httpTimeout = {
        socket: 30000,
        request: 30000,
        response: 60000,
    }
    storagePath: any
    dialogService: DialogService
    constructor(dialogService: DialogService) {
        this.dialogService = dialogService
        this.storagePath = getAppDataDir()
        console.log('storagePath', this.storagePath)
    }

    public getTime(): number {
        return new Date().getTime()
    }
    public async getTasks() {
        // jsondb.init()
        const data = await jsondb.getDB()
        // console.log('data', data)
        return data
    }

    // download m3u8
    public async downloadM3u8(videoItem: TaskItem, targetPath = this.storagePath) {
        const m3u8Url = videoItem.url
        const headers = videoItem.headers
        const sampleFilename = new URL(m3u8Url).pathname.split('/').pop()
        const defaultName = new Date().getTime().toString()
        const dirName = videoItem.name || defaultName
        console.log("@@@dirName", dirName)
        targetPath = join(targetPath, dirName)
        if (!fs.existsSync(targetPath)) {
            console.log('targetPath', targetPath)
            fs.mkdirSync(targetPath, { recursive: true })
        }

        try {
            if (fs.existsSync(join(targetPath, sampleFilename))) {
                console.log('file exists')
                const result = this.analyzeM3u8File(targetPath, sampleFilename)
                if (result.type === 'segments') {
                    const duration = result.duration
                    const newTask: TaskItem = {
                        ...videoItem,
                        url: m3u8Url,
                        headers: headers,
                        status: 'downloaded',
                        duration,
                        durationStr: timeFormat(duration),
                        createTime: new Date().getTime(),
                        directory: targetPath,
                    }
                    await jsondb.update(newTask)
                    try {
                        await this.downloadTS(newTask)
                    } catch (error) {
                        Logger.error('downloadTS in file exists', error)
                    }
                } else {
                    // playlist 
                    this.dialogService.showPlaylistTaskDialog(result.data, videoItem)
                }
            }
            else {
                console.log('start download')
                try {
                    await download(m3u8Url, targetPath, {
                        // filename: name,
                        timeout: M3u8Service.httpTimeout,
                        headers: headers,
                        retry: {
                            retries: 3
                        }
                    })
                } catch (error) {
                    Logger.error('download m3u8 error', error)
                    return
                }
                console.log('download finished')

                const result = await this.analyzeM3u8File(targetPath, sampleFilename)
                // segments or playlists
                if (result.type === 'segments') {
                    const duration = result.duration
                    let newTask: TaskItem = {
                        ...videoItem,
                        url: m3u8Url,
                        headers: headers,
                        status: 'downloaded',
                        duration,
                        durationStr: timeFormat(duration),
                        createTime: new Date().getTime(),
                        directory: targetPath,
                    }
                    await jsondb.update(newTask)
                    const options: Electron.MessageBoxOptions = {
                        type: 'info',
                        title: 'Application Menu Demo',
                        buttons: ['Ok'],
                        message: 'name: ' + sampleFilename + '\ntime durattion ' + timeFormat(duration) + 's',
                    }
                    dialog.showMessageBox(options)
                        .then(async (val) => {
                            try {
                                await this.downloadTS(newTask)
                            } catch (error) {
                                Logger.error('downloadTS', error)
                            }
                        }).catch(Logger.error);
                } else {
                    // playlist 
                    this.dialogService.showPlaylistTaskDialog(result.data, videoItem)
                }
            }
        }
        catch (err) {
            console.log('err', err)
        }
    }
    public async deleteTask(num: number) {
        try {
            const data = await jsondb.getDB()
            const tasks = data.tasks as TaskItem[]
            if (tasks[num].status === 'downloaded') {
                fsExtra.removeSync(tasks[num].directory)
            }
            tasks.splice(num, 1)
            jsondb.db.tasks = tasks
            await jsondb.db.write()
        }
        catch (error) {
            console.log('error', error)
        }
    }
    public async refactorTask() {
        const data = await jsondb.getDB()
        const tasks = data.tasks
        tasks.forEach((item, index) => {
            // TODO: need change the name
            item.directory = join(this.storagePath, item.name.split('.')[0])
        })
        try {
            jsondb.db.tasks = tasks
            await jsondb.db.write()
        }
        catch (error) {
            console.log('error', error)
        }
    }
    /**
     * analyze the M3U8 file return segments or playlists
     * @param targetPath file directory
     * @param sampleFilename file name
     * @returns 
     */
    analyzeM3u8File(targetPath: string, sampleFilename: string) {
        const str = fs.readFileSync(join(targetPath, sampleFilename), 'utf8')
        const parser = new Parser()
        parser.push(str)
        // console.log(parser.manifest)
        const { segments } = parser.manifest
        let streamDuration = 0
        streamDuration = segments.reduce((acc, cur) => {
            return acc + cur.duration
        }, 0)
        console.log('streamDuration: ', streamDuration, timeFormat(streamDuration))
        // console.log(parser)

        // playlist
        if (parser.manifest.playlists && parser.manifest.playlists.length !== 0) {
            console.log(parser.manifest.playlists)
            return { type: 'playlist', data: parser.manifest.playlists, duration: streamDuration }
        }
        return { type: 'segments', data: segments, duration: streamDuration }
    }
    async downloadTS(task: TaskItem) {
        console.log('task', task)
        const urlOjb = new URL(task.url)
        const sampleFilename = urlOjb.pathname.split('/').pop()
        const targetPath = getAppDataDir()
        const baseURL = task.url.substring(0, task.url.indexOf(sampleFilename))
        console.log('baseURL', baseURL)
        const tsDir = task.directory
        console.log('tsDir', tsDir)

        const str = fs.readFileSync(join(tsDir, sampleFilename), 'utf8')
        const parser = new Parser()
        parser.push(str)
        // console.log(parser.manifest)
        const { segments } = parser.manifest
        let streamDuration = 0
        streamDuration = segments.reduce((acc, cur) => {
            return acc + cur.duration
        }, 0)
        const segmentCount = segments.length
        let downloadedCount = 0
        console.log('streamDuration: ', streamDuration)

        if (!fs.existsSync(tsDir)) {
            console.log('tsDir', tsDir)
            fs.mkdirSync(tsDir, { recursive: true })
        }
        // download key
        const key = parser.manifest.segments[0].key?.uri
        if (key) {
            const url = `${baseURL}${key}`
            console.log('key', url)
            try {
                await download(url, tsDir, {
                    headers: task.headers,
                    // agent: url.startsWith('https') ? proxy.https : proxy.http,
                    // filename: 'key',
                    retry: {
                        retries: 3
                    }
                })
            } catch (err) {
                console.error(err)
                Logger.error('[download] error key', url, err);
            }
        }
        // check if segments existed
        const existedSegments = fs.readdirSync(tsDir)
        console.log('existedSegments', existedSegments.length)
        let count = 0
        let needToDownloadCount = 0
        for (const segment of segments) {
            const segmentFile = new URL(`${baseURL}${segment.uri}`).pathname.split('/').pop()
            if (existedSegments.includes(segmentFile)) {
                downloadedCount++
                count++
                // console.log('existed', segmentFile)
            } else {
                needToDownloadCount++
                // console.log('not existed', segmentFile)
            }
        }
        console.log('needToDownloadCount', needToDownloadCount)
        await jsondb.update({
            ...task,
            segmentCount: segmentCount,
            downloadedCount: downloadedCount,
            progress: downloadedCount + '/' + segmentCount,
        })
        const newTaskArray = await jsondb.getDB()
        this.dialogService.updateProgress(newTaskArray)
        console.log('count', count)

        async.mapLimit(segments, 5, async (segment) => {
            // console.log('segment', segment)
            try {
                let url = ''
                if (segment.uri.startsWith('http') || segment.uri.startsWith('https')) {
                    url = segment.uri
                } else {
                    url = `${baseURL}${segment.uri}`
                }
                const segmentFile = new URL(url).pathname.split('/').pop()
                // const name = segment.uri
                if (fs.existsSync(join(tsDir, segmentFile))) {
                    // log.info('[download] already existed, skip segment', segment)
                    // downloadedCount++
                    return 'existed'
                } else {
                    let a = await download(url, tsDir, {
                        headers: task.headers,
                        // agent: url.startsWith('https') ? proxy.https : proxy.http,
                        // filename: name,
                        retry: {
                            retries: 3
                        }
                    })
                    downloadedCount++
                    await jsondb.update({
                        ...task,
                        segmentCount: segmentCount,
                        downloadedCount: downloadedCount,
                        progress: downloadedCount + '/' + segmentCount,
                    })
                    const newTaskArray = await jsondb.getDB()
                    this.dialogService.updateProgress(newTaskArray)
                    return 'ok'
                }

            } catch (error) {
                console.error(error);
                const url = `${baseURL}${segment.uri}`
                Logger.error('[download] error segment', url, error);
                return 'error'
            }
        }, (err, results) => {
            if (err) {
                console.error(err)
                Logger.error('[download] error', err);
                return
            }
            // results is now an array of the response bodies
            let errorCount = results.map((item, index) => item === 'error' ? index : null).filter(item => item !== null)
            const okCount = results.map((item, index) => item === 'ok' ? index : null).filter(item => item !== null)
            console.log('task ok', okCount.length)
            console.log('task error', errorCount.length)
        })
    }

}

