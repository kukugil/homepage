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

function authHeaders(token?: string): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` }
  return {}
}

export function uploadBook(
  sn: string,
  file: File,
  token?: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append("sn", sn)
    formData.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total)
      }
    })
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error)) }
        catch { reject(new Error(`Upload failed (${xhr.status})`)) }
      }
    })
    xhr.addEventListener("error", () => reject(new Error("Network error")))
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))
    xhr.open("POST", "/api/v1/books/upload")
    const headers = authHeaders(token)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.send(formData)
  })
}

export function uploadBooks(
  sn: string,
  files: File[],
  token?: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<BatchUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append("sn", sn)
    files.forEach((f) => formData.append("files", f))

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total)
      }
    })
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error)) }
        catch { reject(new Error(`Upload failed (${xhr.status})`)) }
      }
    })
    xhr.addEventListener("error", () => reject(new Error("Network error")))
    xhr.open("POST", "/api/v1/books/batch-upload")
    const headers = authHeaders(token)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.send(formData)
  })
}

export async function fetchBooks(sn: string, opts?: string | { token?: string; signal?: AbortSignal }): Promise<BookResponse[]> {
  let token: string | undefined
  let signal: AbortSignal | undefined
  if (typeof opts === 'string') { token = opts }
  else if (opts) { token = opts.token; signal = opts.signal }
  const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books`, {
    headers: authHeaders(token),
    signal,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error)
  }
  const data = await resp.json()
  return data.books || []
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
