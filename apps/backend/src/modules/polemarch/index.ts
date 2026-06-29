import { Module, MedusaService } from "@medusajs/framework/utils"
import path from "path"
import { Notification } from "./models/notification"
import { JobRun } from "./models/job-run"
import {
  writePrivateFile,
  deletePrivateFile,
  readPrivateFile,
} from "../../utils/private-storage"

// File service — proxied through the module so admin/upload routes
// can call it via container.resolve("polemarch"). Kept inside this
// module because the prior (JS) version did the same; moving the
// file to @medusajs/file would require audit-trail rewrites.
//
// All actual I/O is delegated to utils/private-storage, which routes to
// the local `static/` volume OR the configured PRIVATE S3 backend
// (backrow23 → File storage → "Private uploads"). Default is local, so
// behaviour is unchanged until an operator switches the private scope.
class FileService {
  async uploadLocal(file: { originalname?: string; buffer: Buffer }) {
    const sanitizedName = path
      .basename(file.originalname || "upload.pdf")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
    const fileName = `${Date.now()}_${sanitizedName}`
    return await writePrivateFile(file.buffer, fileName)
  }

  async saveFile(buffer: Buffer, fileName: string) {
    return await writePrivateFile(buffer, fileName)
  }

  async deleteLocal(url: string) {
    if (!url || typeof url !== "string" || !url.includes("/static/")) {
      return { success: false }
    }
    return await deletePrivateFile(url)
  }

  /** Read a private file back as a Buffer (local or private S3). */
  async readFile(url: string): Promise<Buffer | null> {
    return await readPrivateFile(url)
  }
}

class RisitexModuleService extends MedusaService({ Notification, JobRun }) {
  private fileService: FileService

  constructor(container: any) {
    super(container)
    this.fileService = new FileService()
  }

  async uploadLocal(file: { originalname?: string; buffer: Buffer }) {
    return await this.fileService.uploadLocal(file)
  }

  async deleteFile(url: string) {
    return await this.fileService.deleteLocal(url)
  }

  /** Read a private file back (local or configured private S3). */
  async readFile(url: string) {
    return await this.fileService.readFile(url)
  }
}

export const POLEMARCH_MODULE = "polemarch"

export default Module(POLEMARCH_MODULE, {
  service: RisitexModuleService,
})
