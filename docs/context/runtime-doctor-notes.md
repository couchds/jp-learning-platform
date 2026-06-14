# Runtime Doctor Notes

- The desktop overlay can appear blank if Tk is created and then the main thread blocks on local API calls before the first paint. Keep startup work and OCR requests off the Tk UI thread.
- The API launcher prefers `services/desktop-overlay/.venv/bin/python`; the Runtime Doctor mirrors that expectation and checks imports through the same preferred runtime.
- The API launcher passes `YOMUNAMI_WEB_URL` from the browser request origin so the overlay's Open Web App button still works when Vite falls back from `5173` to another allowed local port.
- OCR, recognition, and speech services are optional companions. Their health checks should remain warnings so the main local study desk can still run.
- macOS Screen Recording and Accessibility permissions are not inspectable here in a reliable cross-process way, so the doctor emits a setup hint on Darwin instead of pretending to know the OS state.
