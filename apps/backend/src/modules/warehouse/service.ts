import { MedusaService } from "@medusajs/framework/utils";
import { WarehouseProfile } from "./models/warehouse-profile";

class WarehouseModuleService extends MedusaService({ WarehouseProfile }) {
  /**
   * Get-or-create the profile for a Medusa stock_location.
   */
  async ensureProfile(input: {
    stock_location_id: string;
    gst_number?: string;
    is_owned?: boolean;
  }) {
    const existing = await this.listWarehouseProfiles({
      stock_location_id: input.stock_location_id,
    });
    if (existing.length > 0) return existing[0];
    return this.createWarehouseProfiles({
      stock_location_id: input.stock_location_id,
      gst_number: input.gst_number ?? null,
      is_owned: input.is_owned ?? true,
      operating_hours: null,
      daily_dispatch_capacity: null,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      active: true,
    });
  }
}

export default WarehouseModuleService;
