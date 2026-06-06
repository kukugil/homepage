// API client for E-Reader Express backend

export interface BookResponse {
  book_id: string
  title: string
  author: string
  file_size: number
  format: string
  checksum: string
  metadata_version: number
  cover_url: string
  download_url: string
  created_at: string
  selected?: number
}

export interface UploadResult {
  book_id: string
  title: string
  author: string
  file_size: number
  format: string
  checksum: string
  cover_url: string
  download_url: string
}

export interface BatchUploadResult {
  results: { filename: string; status: "ok" | "error"; book_id?: string; reason?: string }[]
  success_count: number
  fail_count: number
}

const CHUNK_UPLOAD_THRESHOLD = 512 * 1024
const CHUNK_SIZE = 2 * 1024 * 1024
const CHUNK_RETRIES = 2
const MAX_CONCURRENT_CHUNKS = 3

function createUploadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}

function postFormData<T>(
  url: string,
  formData: FormData,
  onProgress?: (loaded: number, total: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total)
      }
    })
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) }
        catch { reject(new Error("Invalid server response")) }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error)) }
        catch { reject(new Error(`Upload failed (${xhr.status})`)) }
      }
    })
    xhr.addEventListener("error", () => reject(new Error("Network error")))
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))
    xhr.open("POST", url)
    xhr.send(formData)
  })
}

async function uploadChunkWithRetry<T>(
  formData: FormData,
  onProgress: (loaded: number, total: number) => void
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt += 1) {
    try {
      return await postFormData<T>("/api/v1/books/chunk-upload", formData, onProgress)
    } catch (err) {
      lastError = err
      console.error(`chunk upload attempt ${attempt}/${CHUNK_RETRIES} failed:`, err)
      if (attempt === CHUNK_RETRIES) break
      await new Promise((resolve) => setTimeout(resolve, attempt * 800))
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Chunk upload failed")
}

async function uploadBookInChunks(
  sn: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadResult> {
  const uploadId = createUploadId()
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  console.log(`chunked upload start: ${file.name} (${(file.size/1048576).toFixed(1)}MB) → ${totalChunks} chunks of ${CHUNK_SIZE/1024}KB`)

  let completed = 0
  const bytesDone = new Array(totalChunks).fill(0)

  async function sendChunk(chunkIndex: number): Promise<UploadResult & { complete?: boolean }> {
    const start = chunkIndex * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)
    const formData = new FormData()
    formData.append("sn", sn)
    formData.append("uploadId", uploadId)
    formData.append("filename", file.name)
    formData.append("chunkIndex", String(chunkIndex))
    formData.append("totalChunks", String(totalChunks))
    formData.append("totalSize", String(file.size))
    formData.append("chunk", chunk, file.name)

    const result = await uploadChunkWithRetry<UploadResult & { complete?: boolean }>(
      formData,
      (loaded) => {
        bytesDone[chunkIndex] = loaded
        const total = bytesDone.reduce((a, b) => a + b, 0)
        onProgress?.(total, file.size)
      }
    )
    completed++
    return result
  }

  // Send chunks in parallel batches of MAX_CONCURRENT_CHUNKS
  for (let i = 0; i < totalChunks; i += MAX_CONCURRENT_CHUNKS) {
    const batch = []
    for (let j = i; j < Math.min(i + MAX_CONCURRENT_CHUNKS, totalChunks); j++) {
      batch.push(sendChunk(j))
    }
    const results = await Promise.all(batch)
    for (const r of results) {
      if (r.complete) return r
    }
  }

  throw new Error("Upload did not complete")
}

export function uploadBook(
  sn: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadResult> {
  if (file.size >= CHUNK_UPLOAD_THRESHOLD) {
    return uploadBookInChunks(sn, file, onProgress)
  }

  const formData = new FormData()
  formData.append("sn", sn)
  formData.append("file", file)
  return postFormData<UploadResult>("/api/v1/books/upload", formData, onProgress)
}

export function uploadBooks(
  sn: string,
  files: File[],
  onProgress?: (loaded: number, total: number) => void
): Promise<BatchUploadResult> {
  return new Promise(async (resolve) => {
    const total = files.reduce((sum, f) => sum + f.size, 0)
    let completedBytes = 0
    const results: BatchUploadResult["results"] = []

    for (const file of files) {
      try {
        const uploaded = await uploadBook(sn, file, (loaded) => {
          onProgress?.(completedBytes + loaded, total)
        })
        completedBytes += file.size
        onProgress?.(completedBytes, total)
        results.push({ filename: file.name, status: "ok", book_id: uploaded.book_id })
      } catch (err) {
        completedBytes += file.size
        onProgress?.(completedBytes, total)
        results.push({
          filename: file.name,
          status: "error",
          reason: err instanceof Error ? err.message : "Upload failed",
        })
      }
    }

    resolve({
      results,
      success_count: results.filter((r) => r.status === "ok").length,
      fail_count: results.filter((r) => r.status === "error").length,
    })
  })
}

export async function fetchBooks(sn: string, signal?: AbortSignal): Promise<BookResponse[]> {
  const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books`, {
    signal,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error)
  }
  const data = await resp.json()
  return data.files || []
}

export async function deleteBook(sn: string, bookId: string): Promise<void> {
  const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books/${encodeURIComponent(bookId)}`, {
    method: "DELETE",
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Delete failed" }))
    throw new Error(err.error)
  }
}

export async function reorderBooks(sn: string, bookIds: string[]): Promise<void> {
  const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_ids: bookIds }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Reorder failed" }))
    throw new Error(err.error)
  }
}

export async function selectBooks(sn: string, bookIds: string[], target?: number): Promise<{ ok: boolean; selected: number; target: number }> {
  const body: Record<string, unknown> = { book_ids: bookIds }
  if (typeof target === 'number') body.target = target
  const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books/select`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Select failed" }))
    throw new Error(err.error)
  }
  return resp.json()
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}
