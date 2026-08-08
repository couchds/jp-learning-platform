import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopService, KakomuDesktopBridge } from "../desktop";
import { SettingsView } from "../views/SettingsView";

vi.mock("../components/BackupPanel", () => ({
  BackupPanel: () => <section>Backup controls</section>
}));

afterEach(() => {
  delete window.kakomuDesktop;
  delete window.yomunamiDesktop;
});

describe("desktop-aware settings", () => {
  it("keeps browser service management read only", () => {
    render(<SettingsView />);
    expect(screen.getByText("Web app")).toBeInTheDocument();
    expect(screen.queryByText("Restart app services")).not.toBeInTheDocument();
  });

  it("shows friendly managed-service health and can recover services", async () => {
    const initial: DesktopService[] = [
      { id: "ocr", label: "Text recognition", status: "running", detail: "Ready", managed: true },
      { id: "recognition", label: "Handwriting recognition", status: "failed", detail: "Could not start", managed: false }
    ];
    const recovered = initial.map((service) => ({ ...service, status: "running" as const, detail: "Ready", managed: true }));
    const restartServices = vi.fn().mockResolvedValue(recovered);
    window.kakomuDesktop = createBridge(initial, restartServices);

    render(<SettingsView />);
    expect(await screen.findByText("Some features need attention")).toBeInTheDocument();
    expect(screen.getByText("Version 0.9.2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Restart app services"));
    expect(await screen.findByText("Everything is ready")).toBeInTheDocument();
    expect(restartServices).toHaveBeenCalledOnce();
  });
});

function createBridge(services: DesktopService[], restartServices: KakomuDesktopBridge["restartServices"]): KakomuDesktopBridge {
  return {
    getRuntime: async () => ({ apiUrl: "http://127.0.0.1:4000", apiToken: "token", version: "0.9.2", platform: "win32", isDesktop: true }),
    getServices: async () => services,
    restartServices,
    capture: async () => ({ ok: true }),
    openDataFolder: async () => undefined,
    onServicesChanged: () => () => undefined,
    onCaptureReady: () => () => undefined
  };
}
