import { Module } from "@medusajs/framework/utils"
import FileStorageService from "./service"

export const FILE_STORAGE_MODULE = "file_storage"

export default Module(FILE_STORAGE_MODULE, {
  service: FileStorageService,
})

export { FileStorageService }
