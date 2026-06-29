import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import EmailProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
    services: [EmailProviderService],
})
