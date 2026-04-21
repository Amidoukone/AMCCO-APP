import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { alertsRouter } from "./alerts.route.js";
import { createTestApp } from "../test/test-app.js";
import { verifyAccessToken } from "../lib/token.js";
import {
  getCurrentUserAlertsSummary,
  listCurrentUserAlerts,
  markAllCurrentUserAlertsAsRead,
  markCurrentUserAlertAsRead
} from "../services/alerts.service.js";

vi.mock("../lib/token.js", () => ({
  verifyAccessToken: vi.fn()
}));

vi.mock("../services/alerts.service.js", () => ({
  listCurrentUserAlerts: vi.fn(),
  getCurrentUserAlertsSummary: vi.fn(),
  markCurrentUserAlertAsRead: vi.fn(),
  markAllCurrentUserAlertsAsRead: vi.fn()
}));

describe("alertsRouter", () => {
  const app = createTestApp(alertsRouter);

  function mockAuthenticatedUser() {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-1",
      companyId: "company-1",
      role: "SUPERVISOR",
      email: "user@example.com",
      type: "access"
    });
  }

  it("GET /alerts rejects missing auth", async () => {
    const response = await request(app).get("/alerts");

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("En-tete d'autorisation manquant ou invalide.");
  });

  it("GET /alerts passes parsed filters and actor context", async () => {
    mockAuthenticatedUser();
    vi.mocked(listCurrentUserAlerts).mockResolvedValue({
      items: [
        {
          id: "alert-1",
          companyId: "company-1",
          targetUserId: "user-1",
          code: "TASK_ASSIGNED",
          message: "Une tache vous a ete assignee.",
          severity: "INFO",
          entityType: "TASK",
          entityId: "task-1",
          metadata: null,
          readAt: null,
          createdAt: new Date().toISOString()
        }
      ],
      unreadCount: 1
    });

    const response = await request(app)
      .get("/alerts?unreadOnly=true&severity=WARNING&limit=25&offset=5&entityType=TRANSACTION&entityId=txn-1")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(listCurrentUserAlerts).toHaveBeenCalledWith(
      {
        actorId: "user-1",
        companyId: "company-1",
        role: "SUPERVISOR"
      },
      {
        limit: 25,
        offset: 5,
        unreadOnly: true,
        severity: "WARNING",
        entityType: "TRANSACTION",
        entityId: "txn-1"
      }
    );
    expect(response.body.unreadCount).toBe(1);
  });

  it("GET /alerts/summary returns unread counter", async () => {
    mockAuthenticatedUser();
    vi.mocked(getCurrentUserAlertsSummary).mockResolvedValue({
      unreadCount: 4
    });

    const response = await request(app)
      .get("/alerts/summary")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.item.unreadCount).toBe(4);
  });

  it("PATCH /alerts/:alertId/read marks one alert as read", async () => {
    mockAuthenticatedUser();
    vi.mocked(markCurrentUserAlertAsRead).mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/alerts/alert-123456/read")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(markCurrentUserAlertAsRead).toHaveBeenCalledWith(
      {
        actorId: "user-1",
        companyId: "company-1",
        role: "SUPERVISOR"
      },
      {
        alertId: "alert-123456"
      }
    );
  });

  it("PATCH /alerts/read-all marks all alerts as read", async () => {
    mockAuthenticatedUser();
    vi.mocked(markAllCurrentUserAlertsAsRead).mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/alerts/read-all")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(markAllCurrentUserAlertsAsRead).toHaveBeenCalledWith({
      actorId: "user-1",
      companyId: "company-1",
      role: "SUPERVISOR"
    });
  });
});
