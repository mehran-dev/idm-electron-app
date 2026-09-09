import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface SocialDownloadTools {
  downloader: string
  ffmpegDirectory?: string
  hasFfmpeg: boolean
}

interface ToolResolutionOptions {
  appPath: string
  resourcesPath: string
  platform?: NodeJS.Platform
  arch?: string
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
}

export function resolveSocialDownloadTools({
  appPath,
  resourcesPath,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  exists = existsSync,
}: ToolResolutionOptions): SocialDownloadTools {
  const downloaderName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const platformDirectory = `${platform}-${arch}`
  const vendorDirectories = [
    join(appPath, 'vendor', platformDirectory),
    join(resourcesPath, 'vendor', platformDirectory),
    join(appPath, 'vendor', platform),
    join(resourcesPath, 'vendor', platform),
    join(appPath, 'vendor'),
    join(resourcesPath, 'vendor'),
  ]

  // The legacy flat vendor directory contains Linux executables. Only consider
  // its extensionless files on Linux; the flat Windows .exe is also supported.
  // Neither is a runnable macOS binary.
  const bundledDownloader = vendorDirectories.find(
    (directory, index) =>
      (index < 4 || platform === 'linux' || platform === 'win32') &&
      exists(join(directory, downloaderName)),
  )
  const configuredDownloader = env.NEXUS_YT_DLP_PATH?.trim()
  const downloader =
    (configuredDownloader && exists(configuredDownloader) ? configuredDownloader : undefined) ??
    (bundledDownloader ? join(bundledDownloader, downloaderName) : downloaderName)

  const configuredFfmpeg = env.NEXUS_FFMPEG_PATH?.trim()
  const ffmpegDirectory = configuredFfmpeg
    ? exists(configuredFfmpeg)
      ? configuredFfmpeg
      : undefined
    : vendorDirectories.find(
        (directory, index) =>
          (index < 4 || platform === 'linux' || platform === 'win32') &&
          exists(join(directory, ffmpegName)),
      )

  return { downloader, ffmpegDirectory, hasFfmpeg: Boolean(ffmpegDirectory) }
}
