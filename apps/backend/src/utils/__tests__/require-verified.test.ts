import { describe, it, expect, vi } from "vitest"
import { requireVerifiedCustomer } from "../require-verified"

/**
 * Unit tests for the Phase C verification gate.
 *
 * We don't spin up Medusa here — the middleware only reads
 * `req.auth_context` and resolves the customer module via
 * `req.scope.resolve(Modules.CUSTOMER)`. Both are mocked.
 */

type FakeRes = {
  status: ReturnType<typeof vi.fn>
  json: ReturnType<typeof vi.fn>
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: vi.fn().mockReturnThis() as unknown as FakeRes["status"],
    json: vi.fn().mockReturnThis() as unknown as FakeRes["json"],
  }
  return res
}

function makeReq(args: {
  customerId?: string
  customer?: { metadata: Record<string, unknown> | null } | null
  customerThrows?: boolean
}) {
  const retrieveCustomer = args.customerThrows
    ? vi.fn().mockRejectedValue(new Error("db boom"))
    : vi.fn().mockResolvedValue(args.customer ?? null)
  return {
    auth_context: args.customerId
      ? { app_metadata: { customer_id: args.customerId } }
      : undefined,
    scope: {
      resolve: vi.fn().mockReturnValue({ retrieveCustomer }),
    },
  } as any
}

describe("requireVerifiedCustomer", () => {
  it("401s when no auth_context.customer_id is present", async () => {
    const req = makeReq({})
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "auth.required" }),
    )
  })

  it("401s when the customer doesn't exist", async () => {
    const req = makeReq({ customerId: "cus_1", customer: null })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("500s when the customer lookup throws (does NOT fail open)", async () => {
    const req = makeReq({ customerId: "cus_1", customerThrows: true })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "verification.lookup_failed" }),
    )
  })

  it("403s with account_not_verified when email is not verified", async () => {
    const req = makeReq({
      customerId: "cus_1",
      customer: { metadata: {} },
    })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    const body = res.json.mock.calls[0]?.[0] as {
      message: string
      verification: { email_verified: boolean; phone_verified: boolean }
    }
    expect(body.code).toBe("account_not_verified")
    expect(body.next).toBe("/auth/verification-center")
    expect(body.message).toMatch(/email.*whatsapp|whatsapp.*email/i)
    expect(body.verification.email_verified).toBe(false)
    expect(body.verification.phone_verified).toBe(false)
  })

  it("403s when email is not verified — phone verified alone is not enough", async () => {
    const req = makeReq({
      customerId: "cus_1",
      customer: { metadata: { phone_verified: true } },
    })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
    const body = res.json.mock.calls[0]?.[0] as {
      message: string
      verification: { email_verified: boolean }
    }
    expect(body.message).toMatch(/email/i)
    expect(body.verification.email_verified).toBe(false)
  })

  it("403s when phone is not verified — email verified alone is not enough", async () => {
    const req = makeReq({
      customerId: "cus_1",
      customer: { metadata: { email_verified: true } },
    })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
    const body = res.json.mock.calls[0]?.[0] as {
      message: string
      verification: { phone_verified: boolean }
    }
    expect(body.message).toMatch(/whatsapp|phone/i)
    expect(body.verification.phone_verified).toBe(false)
  })

  it("calls next() when both flags are true", async () => {
    const req = makeReq({
      customerId: "cus_1",
      customer: {
        metadata: { email_verified: true, phone_verified: true },
      },
    })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("respects strict equality — `email_verified: 1` does NOT count as verified", async () => {
    const req = makeReq({
      customerId: "cus_1",
      customer: {
        metadata: { email_verified: 1 },
      },
    })
    const res = makeRes()
    const next = vi.fn()
    await requireVerifiedCustomer(req, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
