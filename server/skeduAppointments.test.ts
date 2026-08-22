import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  isAxiosError: vi.fn((error: unknown) =>
    Boolean(error && typeof error === "object" && (error as any).isAxiosError)
  ),
}));

vi.mock("axios", () => ({ default: axiosMock }));

import {
  cancelSkeduAppointment,
  getSkeduAppointmentPayments,
  hasConfirmedSkeduWebpayPayment,
  rescheduleSkeduAppointment,
  SkeduAppointmentOperationError,
} from "./skedu";

const APPOINTMENT_UUID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_UUID = "22222222-2222-4222-8222-222222222222";
const STARTS_AT = "2026-08-25T14:00:00.000Z";
const STORE_UUID = "c5e0a893-7eff-42b8-815a-296b1a9c345d";
const originalAppId = process.env.SKEDU_APP_ID;
const originalAppSecret = process.env.SKEDU_APP_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SKEDU_APP_ID = "test-app-id";
  process.env.SKEDU_APP_SECRET = "test-app-secret";
});

afterAll(() => {
  process.env.SKEDU_APP_ID = originalAppId;
  process.env.SKEDU_APP_SECRET = originalAppSecret;
});

describe("operaciones verificadas de citas Skedu", () => {
  it("reagenda con el payload soportado y confirma fecha y recurso por GET", async () => {
    axiosMock.put.mockResolvedValueOnce({ status: 200, data: {} });
    axiosMock.get.mockResolvedValueOnce({
      data: {
        Data: {
          UUID: APPOINTMENT_UUID,
          StartsAt: "2026-08-25T10:00:00-04:00",
          ResourceUUID: RESOURCE_UUID.toUpperCase(),
          DeletedAt: null,
          RealDeletedAt: null,
        },
      },
    });

    await expect(
      rescheduleSkeduAppointment(APPOINTMENT_UUID, {
        startsAt: STARTS_AT,
        resourceUuid: RESOURCE_UUID,
      })
    ).resolves.toMatchObject({
      verified: true,
      appointment: { UUID: APPOINTMENT_UUID },
    });

    expect(axiosMock.put).toHaveBeenCalledWith(
      `https://api.getskedu.com/appointments/${APPOINTMENT_UUID}`,
      { StartsAt: STARTS_AT, ResourceUUID: RESOURCE_UUID },
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Skedu-App-ID": "test-app-id",
          "X-Skedu-App-Secret": "test-app-secret",
        }),
        params: { StoreUUID: STORE_UUID },
      })
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      `https://api.getskedu.com/appointments/${APPOINTMENT_UUID}`,
      expect.objectContaining({ params: { StoreUUID: STORE_UUID } })
    );
  });

  it("cancela con body vacío y verifica DeletedAt por GET", async () => {
    axiosMock.delete.mockResolvedValueOnce({ status: 204, data: null });
    axiosMock.get.mockResolvedValueOnce({
      data: {
        Data: {
          UUID: APPOINTMENT_UUID,
          DeletedAt: "2026-08-22T20:00:00.000Z",
        },
      },
    });

    await expect(
      cancelSkeduAppointment(APPOINTMENT_UUID)
    ).resolves.toMatchObject({
      verified: true,
      verification: "deleted_at",
      appointment: { UUID: APPOINTMENT_UUID },
    });
    expect(axiosMock.delete).toHaveBeenCalledWith(
      `https://api.getskedu.com/appointments/${APPOINTMENT_UUID}`,
      expect.objectContaining({
        data: {},
        params: { StoreUUID: STORE_UUID },
      })
    );
  });

  it("acepta un 404 del GET posterior como cancelación verificada", async () => {
    axiosMock.delete.mockResolvedValueOnce({ status: 204, data: null });
    axiosMock.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });

    await expect(cancelSkeduAppointment(APPOINTMENT_UUID)).resolves.toEqual({
      verified: true,
      verification: "not_found",
      appointment: null,
    });
  });

  it("trata DELETE 404 como cancelación idempotente si el GET también confirma ausencia", async () => {
    axiosMock.delete.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });
    axiosMock.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });

    await expect(cancelSkeduAppointment(APPOINTMENT_UUID)).resolves.toEqual({
      verified: true,
      verification: "not_found",
      appointment: null,
    });
  });

  it("verifica el estado después de una respuesta ambigua de la mutación", async () => {
    axiosMock.put.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503 },
    });
    axiosMock.get.mockResolvedValueOnce({
      data: {
        Data: {
          UUID: APPOINTMENT_UUID,
          StartsAt: STARTS_AT,
          ResourceUUID: RESOURCE_UUID,
        },
      },
    });

    await expect(
      rescheduleSkeduAppointment(APPOINTMENT_UUID, {
        startsAt: STARTS_AT,
        resourceUuid: RESOURCE_UUID,
      })
    ).resolves.toMatchObject({ verified: true });
  });

  it("consulta pagos por GroupUUID y detecta solo Webpay confirmado y vigente", async () => {
    axiosMock.get.mockResolvedValueOnce({
      data: {
        Data: {
          Items: [
            {
              SystemSlug: "webpay",
              IsConfirmed: true,
              Amount: 25_000,
              DeletedAt: null,
              CancelledAt: null,
            },
          ],
        },
      },
    });

    const payments = await getSkeduAppointmentPayments(APPOINTMENT_UUID);
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.getskedu.com/payments",
      expect.objectContaining({
        params: {
          GroupUUID: APPOINTMENT_UUID,
          limit: 20,
          offset: 0,
        },
      })
    );
    expect(hasConfirmedSkeduWebpayPayment(payments)).toBe(true);
    expect(
      hasConfirmedSkeduWebpayPayment([
        { SystemSlug: "webpay", IsConfirmed: false, Amount: 25_000 },
        { SystemSlug: "offline", IsConfirmed: true, Amount: 25_000 },
        {
          SystemSlug: "webpay",
          IsConfirmed: true,
          Amount: 25_000,
          DeletedAt: "2026-08-22T20:00:00.000Z",
        },
      ])
    ).toBe(false);
  });

  it("descarta config y headers privados al propagar un error de Axios", async () => {
    axiosMock.put.mockRejectedValueOnce({
      isAxiosError: true,
      message: "Request failed",
      code: "ERR_BAD_REQUEST",
      response: { status: 404, data: { message: "not found" } },
      config: {
        headers: { "X-Skedu-App-Secret": "must-not-leak" },
      },
    });

    let received: unknown;
    try {
      await rescheduleSkeduAppointment(APPOINTMENT_UUID, {
        startsAt: STARTS_AT,
        resourceUuid: RESOURCE_UUID,
      });
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(SkeduAppointmentOperationError);
    expect(received).toMatchObject({
      operation: "reschedule",
      status: 404,
      code: "ERR_BAD_REQUEST",
    });
    expect(String((received as Error).message)).not.toContain("must-not-leak");
    expect(JSON.stringify(received)).not.toContain("must-not-leak");
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it("rechaza UUIDs y fechas ambiguas antes de llamar a Skedu", async () => {
    await expect(
      rescheduleSkeduAppointment("../appointments", {
        startsAt: "2026-08-25 10:00",
        resourceUuid: RESOURCE_UUID,
      })
    ).rejects.toBeInstanceOf(SkeduAppointmentOperationError);
    await expect(cancelSkeduAppointment("not-a-uuid")).rejects.toBeInstanceOf(
      SkeduAppointmentOperationError
    );
    expect(axiosMock.put).not.toHaveBeenCalled();
    expect(axiosMock.delete).not.toHaveBeenCalled();
  });
});
