import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import sharp from 'sharp';

import type { AttachmentKind } from '@thingcost/contracts';

interface DetectedFileType {
  kind: AttachmentKind;
  mediaType: string;
  extension: string;
}

export interface StoredAttachmentFile {
  storageKey: string;
  thumbnailStorageKey: string | null;
  originalName: string;
  kind: AttachmentKind;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
}

export class AttachmentStorageError extends Error {
  constructor(
    readonly code: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE' | 'INVALID_IMAGE',
    message: string,
  ) {
    super(message);
    this.name = 'AttachmentStorageError';
  }
}

class HashAndLimitTransform extends Transform {
  readonly hash = createHash('sha256');
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.bytes += chunk.byteLength;

    if (this.bytes > this.maxBytes) {
      callback(
        new AttachmentStorageError(
          'FILE_TOO_LARGE',
          `文件不能超过 ${String(Math.ceil(this.maxBytes / 1_048_576))} MB`,
        ),
      );
      return;
    }

    this.hash.update(chunk);
    callback(null, chunk);
  }
}

function detectFileType(bytes: Buffer): DetectedFileType | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { kind: 'photo', mediaType: 'image/jpeg', extension: '.jpg' };
  }

  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: 'photo', mediaType: 'image/png', extension: '.png' };
  }

  const signature = bytes.subarray(0, 12).toString('ascii');
  if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) {
    return { kind: 'photo', mediaType: 'image/gif', extension: '.gif' };
  }

  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') {
    return { kind: 'photo', mediaType: 'image/webp', extension: '.webp' };
  }

  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { kind: 'document', mediaType: 'application/pdf', extension: '.pdf' };
  }

  return null;
}

function safeOriginalName(value: string, extension: string): string {
  const cleaned = [...basename(value)]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim()
    .slice(0, 240);

  if (!cleaned) {
    return `attachment${extension}`;
  }

  return extname(cleaned) ? cleaned : `${cleaned}${extension}`;
}

function dimensionsForOrientation(
  width: number,
  height: number,
  orientation: number | undefined,
): { width: number; height: number } {
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

export class AttachmentStorage {
  readonly root: string;
  private readonly temporaryRoot: string;

  constructor(
    root: string,
    private readonly maxBytes: number,
  ) {
    this.root = resolve(root);
    this.temporaryRoot = resolve(this.root, '.tmp');
  }

  async initialize(): Promise<void> {
    await mkdir(this.temporaryRoot, { recursive: true, mode: 0o700 });
  }

  async store(
    stream: NodeJS.ReadableStream,
    suppliedName: string,
  ): Promise<StoredAttachmentFile> {
    await this.initialize();
    const id = randomUUID();
    const temporaryPath = resolve(this.temporaryRoot, `${id}.upload`);
    const temporaryThumbnailPath = resolve(this.temporaryRoot, `${id}.thumb.webp`);
    const meter = new HashAndLimitTransform(this.maxBytes);
    let finalPath: string | null = null;
    let finalThumbnailPath: string | null = null;

    try {
      await pipeline(
        stream,
        meter,
        createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
      );

      if (meter.bytes === 0) {
        throw new AttachmentStorageError('EMPTY_FILE', '不能上传空文件');
      }

      const file = await open(temporaryPath, 'r');
      const signature = Buffer.alloc(16);
      await file.read(signature, 0, signature.length, 0);
      await file.close();
      const detected = detectFileType(signature);

      if (!detected) {
        throw new AttachmentStorageError(
          'UNSUPPORTED_FILE',
          '仅支持 JPEG、PNG、WebP、GIF 图片和 PDF 文档',
        );
      }

      let width: number | null = null;
      let height: number | null = null;

      if (detected.kind === 'photo') {
        try {
          const image = sharp(temporaryPath, {
            failOn: 'error',
            limitInputPixels: 100_000_000,
            animated: false,
          });
          const metadata = await image.metadata();

          if (!metadata.width || !metadata.height) {
            throw new Error('Missing image dimensions.');
          }

          ({ width, height } = dimensionsForOrientation(
            metadata.width,
            metadata.height,
            metadata.orientation,
          ));

          await image
            .rotate()
            .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(temporaryThumbnailPath);
        } catch (error) {
          if (error instanceof AttachmentStorageError) {
            throw error;
          }

          throw new AttachmentStorageError('INVALID_IMAGE', '图片文件已损坏或无法解码');
        }
      }

      const directory = id.slice(0, 2);
      const storageKey = `${directory}/${id}${detected.extension}`;
      const thumbnailStorageKey =
        detected.kind === 'photo' ? `${directory}/${id}.thumb.webp` : null;
      finalPath = this.resolveKey(storageKey);
      finalThumbnailPath = thumbnailStorageKey
        ? this.resolveKey(thumbnailStorageKey)
        : null;
      await mkdir(resolve(this.root, directory), { recursive: true, mode: 0o700 });
      await rename(temporaryPath, finalPath);

      if (finalThumbnailPath) {
        await rename(temporaryThumbnailPath, finalThumbnailPath);
      }

      return {
        storageKey,
        thumbnailStorageKey,
        originalName: safeOriginalName(suppliedName, detected.extension),
        kind: detected.kind,
        mediaType: detected.mediaType,
        sizeBytes: meter.bytes,
        sha256: meter.hash.digest('hex'),
        width,
        height,
      };
    } catch (error) {
      await Promise.all([
        rm(temporaryPath, { force: true }),
        rm(temporaryThumbnailPath, { force: true }),
        ...(finalPath ? [rm(finalPath, { force: true })] : []),
        ...(finalThumbnailPath ? [rm(finalThumbnailPath, { force: true })] : []),
      ]);
      throw error;
    }
  }

  openReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolveKey(storageKey));
  }

  async writeStoredFile(storageKey: string, content: Buffer): Promise<void> {
    await this.initialize();
    const finalPath = this.resolveKey(storageKey);
    const directory = storageKey.slice(0, 2);
    const temporaryPath = resolve(this.temporaryRoot, `${randomUUID()}.restore`);
    try {
      await mkdir(resolve(this.root, directory), { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, content, { flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async clearStoredFiles(): Promise<void> {
    await this.initialize();
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.name !== '.tmp')
        .map((entry) =>
          rm(resolve(this.root, entry.name), { recursive: true, force: true }),
        ),
    );
  }

  async fileSize(storageKey: string): Promise<number> {
    return (await stat(this.resolveKey(storageKey))).size;
  }

  async remove(storageKeys: Array<string | null>): Promise<void> {
    await Promise.all(
      storageKeys
        .filter((key): key is string => Boolean(key))
        .map((key) => rm(this.resolveKey(key), { force: true })),
    );
  }

  private resolveKey(storageKey: string): string {
    if (
      !/^[0-9a-f]{2}\/[0-9a-f-]+(?:\.thumb)?\.(?:jpg|png|gif|webp|pdf)$/u.test(storageKey)
    ) {
      throw new Error('Invalid attachment storage key.');
    }

    const result = resolve(this.root, storageKey);
    if (!result.startsWith(`${this.root}${sep}`)) {
      throw new Error('Attachment path escaped its storage root.');
    }

    return result;
  }
}
