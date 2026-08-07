import { desktopCapturer, nativeImage, screen, type DesktopCapturerSource, type Display } from "electron";

export type DesktopCapture = {
  dataUrl: string;
  width: number;
  height: number;
  displayId: string;
  sourceName: string;
};

export type DesktopCaptureResult = {
  ok: boolean;
  capture?: DesktopCapture;
  error?: string;
};

export async function captureCurrentDisplay(): Promise<DesktopCaptureResult> {
  const testCapture = process.env.KAKOMU_TEST_CAPTURE_DATA_URL ?? process.env.YOMUNAMI_TEST_CAPTURE_DATA_URL;
  if (testCapture) return captureFromTestImage(testCapture);

  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const displays = screen.getAllDisplays();
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: captureSize(display)
    });
    const source = selectCaptureSource(sources, display, displays);
    if (!source || source.thumbnail.isEmpty()) {
      return {
        ok: false,
        error: "Kakomu could not capture this display. Check the operating system's screen-recording permission."
      };
    }

    const size = source.thumbnail.getSize();
    return {
      ok: true,
      capture: {
        dataUrl: source.thumbnail.toDataURL(),
        width: size.width,
        height: size.height,
        displayId: String(display.id),
        sourceName: source.name
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Screen capture is unavailable."
    };
  }
}

export function captureSize(display: Pick<Display, "size" | "scaleFactor">) {
  const scaleFactor = Number.isFinite(display.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1;
  return {
    width: Math.max(Math.round(display.size.width * scaleFactor), 1),
    height: Math.max(Math.round(display.size.height * scaleFactor), 1)
  };
}

export function selectCaptureSource<T extends Pick<DesktopCapturerSource, "display_id">>(
  sources: T[],
  display: Pick<Display, "id">,
  displays: Array<Pick<Display, "id">>
) {
  const exact = sources.find((source) => source.display_id === String(display.id));
  if (exact) return exact;

  const displayIndex = displays.findIndex((candidate) => candidate.id === display.id);
  return sources[displayIndex] ?? sources[0];
}

function captureFromTestImage(dataUrl: string): DesktopCaptureResult {
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) return { ok: false, error: "The test capture image is invalid." };
  const size = image.getSize();
  return {
    ok: true,
    capture: {
      dataUrl,
      width: size.width,
      height: size.height,
      displayId: "test-display",
      sourceName: "Test screen"
    }
  };
}
