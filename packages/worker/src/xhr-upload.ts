/**
 * Uploads a blob to a presigned target with XHR (available in dedicated
 * workers; fetch has no upload progress). Resolves on 2xx.
 */
export function xhrUpload(
  target: { method: string; url: string; headers: Record<string, string> },
  file: Blob,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.url)
    for (const [k, v] of Object.entries(target.headers))
      xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error("Upload failed: network error"))
    xhr.onabort = () => reject(new Error("Upload cancelled"))
    xhr.send(file)
  })
}
