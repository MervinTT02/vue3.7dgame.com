import { describe, expect, it } from "vitest";
import { normalizeLocalPreviewRequest } from "@/utils/unityPreviewLocalRequests";

describe("local Unity resource request compatibility", () => {
  it("repairs the Unity loopback origin and preserves the encoded asset URL", () => {
    expect(
      normalizeLocalPreviewRequest(
        "https://127.0.0.1:3001/__xrugc_proxy__?url=https%3A%2F%2Fdata.7dgame.com%2Fa.glb%3Fx%3D1%26y%3D2",
        "http://localhost:3001"
      )
    ).toBe(
      "http://localhost:3001/__xrugc_proxy__?url=https%3A%2F%2Fdata.7dgame.com%2Fa.glb%3Fx%3D1%26y%3D2"
    );
  });
  it("leaves remote URLs, unrelated routes, ports and production origins unchanged", () => {
    for (const input of [
      "https://example.com/__xrugc_proxy__?url=a",
      "https://127.0.0.1:3006/__xrugc_proxy__?url=a",
      "https://127.0.0.1:3001/v1/auth/login",
      "https://data.7dgame.com/a.glb",
    ])
      expect(normalizeLocalPreviewRequest(input, "http://localhost:3001")).toBe(
        input
      );
    const input = "https://127.0.0.1:3001/__xrugc_proxy__?url=a";
    expect(normalizeLocalPreviewRequest(input, "https://d.xrugc.com")).toBe(
      input
    );
    expect(normalizeLocalPreviewRequest(input, "https://localhost:3001")).toBe(
      input
    );
  });
});
