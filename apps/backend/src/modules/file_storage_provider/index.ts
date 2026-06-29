import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ConfigurableFileProviderService from "./service"

export default ModuleProvider(Modules.FILE, {
  services: [ConfigurableFileProviderService],
})
