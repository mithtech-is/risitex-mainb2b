import { Module } from "@medusajs/framework/utils"
import CampaignModuleService from "./service"

export const CAMPAIGN_MODULE = "marketing"

export default Module(CAMPAIGN_MODULE, {
  service: CampaignModuleService,
})

export { CampaignModuleService }
