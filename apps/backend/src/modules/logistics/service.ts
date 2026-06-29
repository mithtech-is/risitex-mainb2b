import { MedusaService } from "@medusajs/framework/utils"
import { ShipmentTransporter } from "./models/shipment-transporter"

class LogisticsModuleService extends MedusaService({
  ShipmentTransporter,
}) {
  /**
   * Upsert one transporter row per shipment. Re-assigning a vehicle
   * is the common case (driver swap before pickup); we keep the
   * same row and bump updated_at rather than spawning history rows.
   */
  async assignTransporter(input: {
    shipment_id: string
    transporter_code: string
    transporter_display_name?: string | null
    vehicle_number?: string | null
    awb?: string | null
    notes?: string | null
    dispatched_at?: Date | null
  }) {
    const existing = await this.listShipmentTransporters({
      shipment_id: input.shipment_id,
    })
    const dispatchedAt = input.dispatched_at ?? new Date()
    if (existing.length > 0) {
      const [updated] = await this.updateShipmentTransporters([
        {
          id: existing[0]!.id,
          transporter_code: input.transporter_code,
          transporter_display_name: input.transporter_display_name ?? null,
          vehicle_number: input.vehicle_number ?? null,
          awb: input.awb ?? null,
          notes: input.notes ?? null,
          dispatched_at: dispatchedAt,
        },
      ])
      return updated
    }
    const [created] = await this.createShipmentTransporters([
      {
        shipment_id: input.shipment_id,
        transporter_code: input.transporter_code,
        transporter_display_name: input.transporter_display_name ?? null,
        vehicle_number: input.vehicle_number ?? null,
        awb: input.awb ?? null,
        notes: input.notes ?? null,
        dispatched_at: dispatchedAt,
      },
    ])
    return created
  }
}

export default LogisticsModuleService
