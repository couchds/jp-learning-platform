#!/usr/bin/env python3
"""Yomunami desktop OCR overlay.

Capture any screen region, send it to the local OCR API, and add selected
terms to the current resource tracker.
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
import tkinter as tk
from tkinter import messagebox, ttk
from PIL import Image, ImageStat, ImageTk
from pynput import keyboard
import mss


CONFIG_PATH = Path.home() / ".yomunami-overlay.json"
DEFAULT_API_URL = os.environ.get("YOMUNAMI_API_URL", "http://127.0.0.1:3001")
DEFAULT_WEB_URL = os.environ.get("YOMUNAMI_WEB_URL", "http://127.0.0.1:5173")
DEFAULT_HOTKEY = "ctrl+shift+o"


@dataclass
class Resource:
    id: int
    name: str
    type: str


@dataclass
class Term:
    term_type: str
    text: str
    reading: str | None = None
    meaning: str | None = None
    source: str = "ocr"
    source_image_id: int | None = None
    frequency: int = 1

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Term":
        return cls(
            term_type=str(payload.get("termType") or payload.get("term_type") or "unknown"),
            text=str(payload.get("text") or ""),
            reading=payload.get("reading"),
            meaning=payload.get("meaning"),
            source=str(payload.get("source") or "ocr"),
            source_image_id=payload.get("sourceImageId") or payload.get("source_image_id"),
            frequency=max(int(payload.get("frequency") or 1), 1),
        )

    def to_api(self) -> dict[str, Any]:
        return {
            "termType": self.term_type,
            "text": self.text,
            "reading": self.reading,
            "meaning": self.meaning,
            "source": self.source,
            "sourceImageId": self.source_image_id,
            "frequency": self.frequency,
        }


@dataclass
class Highlight:
    text: str
    element_type: str
    bbox: dict[str, float]
    confidence: float | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Highlight | None":
        bbox = payload.get("bbox")
        if not isinstance(bbox, dict):
            return None

        try:
            x = float(bbox["x"])
            y = float(bbox["y"])
            width = float(bbox["width"])
            height = float(bbox["height"])
        except (KeyError, TypeError, ValueError):
            return None

        if width <= 0 or height <= 0:
            return None

        confidence = payload.get("confidence")
        return cls(
            text=str(payload.get("text") or ""),
            element_type=str(payload.get("element_type") or payload.get("elementType") or "unknown"),
            bbox={"x": x, "y": y, "width": width, "height": height},
            confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
        )


class OverlayApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Yomunami OCR Overlay")
        self.root.geometry("760x620")
        self.root.minsize(640, 520)

        self.config = self.load_config()
        self.api_url = tk.StringVar(value=self.config.get("api_url", DEFAULT_API_URL))
        self.web_url = tk.StringVar(value=os.environ.get("YOMUNAMI_WEB_URL") or self.config.get("web_url", DEFAULT_WEB_URL))
        self.hotkey = tk.StringVar(value=self.config.get("hotkey", DEFAULT_HOTKEY))
        self.status = tk.StringVar(value="Ready")
        self.resource_label = tk.StringVar(value="No resource selected")

        self.resources: list[Resource] = []
        self.selected_resource_id: int | None = self.config.get("resource_id")
        self.last_terms: list[Term] = []
        self.last_highlights: list[Highlight] = []
        self.last_image: Image.Image | None = None
        self.preview_photo: ImageTk.PhotoImage | None = None
        self.term_vars: list[tk.BooleanVar] = []
        self.hotkey_listener: keyboard.GlobalHotKeys | None = None

        self.build_ui()
        self.root.after(50, self.startup)

    def load_config(self) -> dict[str, Any]:
        if CONFIG_PATH.exists():
            try:
                return json.loads(CONFIG_PATH.read_text())
            except json.JSONDecodeError:
                return {}
        return {}

    def save_config(self) -> None:
        CONFIG_PATH.write_text(
            json.dumps(
                {
                    "api_url": self.api_url.get().rstrip("/"),
                    "web_url": self.web_url.get().rstrip("/"),
                    "hotkey": self.hotkey.get(),
                    "resource_id": self.selected_resource_id,
                },
                indent=2,
            )
        )

    def build_ui(self) -> None:
        self.root.configure(bg="#f6f4ef")
        self.style = ttk.Style(self.root)
        self.style.configure("Hero.TFrame", background="#20201d")
        self.style.configure("Hero.TLabel", background="#20201d", foreground="#fffaf1")
        self.style.configure("Muted.TLabel", foreground="#625a4d")

        outer = ttk.Frame(self.root, padding=18)
        outer.pack(fill=tk.BOTH, expand=True)

        hero = ttk.Frame(outer, padding=16, style="Hero.TFrame")
        hero.pack(fill=tk.X, pady=(0, 14))
        ttk.Label(
            hero,
            text="Yomunami OCR Overlay",
            font=("TkDefaultFont", 20, "bold"),
            style="Hero.TLabel",
        ).pack(anchor=tk.W)
        ttk.Label(
            hero,
            text="Press the hotkey, drag over Japanese text in any visible window, then save useful terms.",
            style="Hero.TLabel",
        ).pack(anchor=tk.W, pady=(6, 0))

        title = ttk.Frame(outer)
        title.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(title, text="Control panel", font=("TkDefaultFont", 14, "bold")).pack(side=tk.LEFT)
        ttk.Button(title, text="Open Web App", command=self.open_web_app).pack(side=tk.RIGHT)

        config_frame = ttk.LabelFrame(outer, text="Local connection", padding=12)
        config_frame.pack(fill=tk.X, pady=8)
        ttk.Label(config_frame, text="API").grid(row=0, column=0, sticky=tk.W)
        ttk.Entry(config_frame, textvariable=self.api_url, width=44).grid(row=0, column=1, sticky=tk.EW, padx=8)
        ttk.Label(config_frame, text="Hotkey").grid(row=0, column=2, sticky=tk.W)
        ttk.Entry(config_frame, textvariable=self.hotkey, width=16).grid(row=0, column=3, sticky=tk.EW, padx=8)
        ttk.Button(config_frame, text="Apply", command=self.apply_settings).grid(row=0, column=4)
        config_frame.columnconfigure(1, weight=1)

        resource_frame = ttk.LabelFrame(outer, text="Target resource", padding=12)
        resource_frame.pack(fill=tk.X, pady=8)
        self.resource_combo = ttk.Combobox(resource_frame, state="readonly", width=54)
        self.resource_combo.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        self.resource_combo.bind("<<ComboboxSelected>>", self.on_resource_select)
        ttk.Button(resource_frame, text="Refresh", command=self.refresh_resources).pack(side=tk.LEFT)

        action_frame = ttk.Frame(outer)
        action_frame.pack(fill=tk.X, pady=10)
        ttk.Button(action_frame, text="Capture Region", command=self.capture_region).pack(side=tk.LEFT)
        ttk.Button(action_frame, text="Add Selected Terms", command=self.add_selected_terms).pack(side=tk.LEFT, padx=8)
        ttk.Label(action_frame, textvariable=self.resource_label).pack(side=tk.RIGHT)

        result_frame = ttk.LabelFrame(outer, text="OCR result", padding=12)
        result_frame.pack(fill=tk.BOTH, expand=True, pady=8)
        self.preview_canvas = tk.Canvas(result_frame, height=220, bg="#191814", highlightthickness=0)
        self.preview_canvas.pack(fill=tk.X, pady=(0, 10))
        self.preview_canvas.create_text(
            14,
            14,
            anchor=tk.NW,
            text="Captured text preview and OCR highlights will appear here.",
            fill="#f7efe0",
        )

        self.raw_text = tk.Text(result_frame, height=6, wrap=tk.WORD)
        self.raw_text.pack(fill=tk.X)

        terms_outer = ttk.Frame(result_frame)
        terms_outer.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        self.terms_canvas = tk.Canvas(terms_outer, highlightthickness=0)
        scrollbar = ttk.Scrollbar(terms_outer, orient=tk.VERTICAL, command=self.terms_canvas.yview)
        self.terms_frame = ttk.Frame(self.terms_canvas)
        self.terms_frame.bind(
            "<Configure>",
            lambda _event: self.terms_canvas.configure(scrollregion=self.terms_canvas.bbox("all")),
        )
        self.terms_canvas.create_window((0, 0), window=self.terms_frame, anchor="nw")
        self.terms_canvas.configure(yscrollcommand=scrollbar.set)
        self.terms_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        ttk.Label(
            self.terms_frame,
            text="No capture yet. Use Capture Region or press the hotkey.",
            style="Muted.TLabel",
        ).pack(anchor=tk.W, pady=6)

        ttk.Label(self.root, textvariable=self.status, relief=tk.SUNKEN, anchor=tk.W).pack(side=tk.BOTTOM, fill=tk.X)

    def startup(self) -> None:
        self.root.update_idletasks()
        try:
            self.start_hotkey_listener()
        except Exception as exc:
            self.status.set(f"Hotkey listener unavailable: {exc}")
        self.refresh_resources()

    def apply_settings(self) -> None:
        self.save_config()
        try:
            self.start_hotkey_listener()
            self.status.set(f"Hotkey set to {self.hotkey.get()}")
        except Exception as exc:
            self.status.set(f"Hotkey listener unavailable: {exc}")

    def open_web_app(self) -> None:
        webbrowser.open(self.web_url.get().rstrip("/") or DEFAULT_WEB_URL)

    def start_hotkey_listener(self) -> None:
        if self.hotkey_listener is not None:
            self.hotkey_listener.stop()

        hotkey_text = self.hotkey.get().strip() or DEFAULT_HOTKEY
        pynput_hotkey = self.to_pynput_hotkey(hotkey_text)
        self.hotkey_listener = keyboard.GlobalHotKeys({pynput_hotkey: self.hotkey_capture})
        self.hotkey_listener.start()

    def to_pynput_hotkey(self, value: str) -> str:
        parts = [part.strip().lower() for part in value.replace("+", " ").split() if part.strip()]
        converted = []
        for part in parts:
            if part in {"ctrl", "control"}:
                converted.append("<ctrl>")
            elif part in {"cmd", "command", "meta"}:
                converted.append("<cmd>")
            elif part == "shift":
                converted.append("<shift>")
            elif part in {"alt", "option"}:
                converted.append("<alt>")
            else:
                converted.append(part)
        return "+".join(converted) if converted else "<ctrl>+<shift>+o"

    def hotkey_capture(self) -> None:
        self.root.after(0, self.capture_region)

    def refresh_resources(self) -> None:
        self.status.set("Loading resources...")
        api_url = self.api_url.get().rstrip("/")
        threading.Thread(target=self.load_resources_worker, args=(api_url,), daemon=True).start()

    def load_resources_worker(self, api_url: str) -> None:
        try:
            response = requests.get(f"{api_url}/api/resources?limit=200", timeout=10)
            response.raise_for_status()
            resources = [
                Resource(id=int(item["id"]), name=str(item["name"]), type=str(item["type"]))
                for item in response.json().get("items", [])
            ]
            self.root.after(0, lambda: self.apply_resources(resources))
        except Exception as exc:
            self.root.after(0, lambda exc=exc: self.status.set(f"Could not load resources: {exc}"))

    def apply_resources(self, resources: list[Resource]) -> None:
        self.resources = resources
        labels = [f"{resource.name} ({resource.type})" for resource in self.resources]
        self.resource_combo["values"] = labels
        selected_index = next(
            (index for index, resource in enumerate(self.resources) if resource.id == self.selected_resource_id),
            0 if self.resources else -1,
        )
        if selected_index >= 0:
            self.resource_combo.current(selected_index)
            self.selected_resource_id = self.resources[selected_index].id
            self.resource_label.set(f"Tracking to: {self.resources[selected_index].name}")
        else:
            self.resource_label.set("Create a resource in the web app first")
        self.status.set("Resources loaded")

    def on_resource_select(self, _event: object) -> None:
        index = self.resource_combo.current()
        if index < 0:
            return
        resource = self.resources[index]
        self.selected_resource_id = resource.id
        self.resource_label.set(f"Tracking to: {resource.name}")
        self.save_config()

    def capture_region(self) -> None:
        self.root.withdraw()
        self.status.set("Drag a region to capture")
        RegionSelector(self.root, self.on_region_selected)

    def on_region_selected(self, rect: dict[str, int] | None) -> None:
        if rect is None:
            self.root.deiconify()
            self.status.set("Capture cancelled")
            return

        try:
            image = self.capture_rect(rect)
            self.root.deiconify()
            status = "Running OCR..."
            if self.image_looks_blank(image):
                status = "Running OCR... Capture looks blank; macOS may need Screen Recording permission."
            self.submit_ocr(image, status)
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror("Capture failed", str(exc))
            self.status.set(f"Capture failed: {exc}")

    def capture_rect(self, rect: dict[str, int]) -> Image.Image:
        with mss.mss() as screen:
            grabbed = screen.grab(rect)
            return Image.frombytes("RGB", grabbed.size, grabbed.rgb)

    def image_looks_blank(self, image: Image.Image) -> bool:
        extrema = ImageStat.Stat(image.convert("L")).extrema[0]
        return (extrema[1] - extrema[0]) < 4

    def submit_ocr(self, image: Image.Image, status: str = "Running OCR...") -> None:
        self.status.set(status)
        api_url = self.api_url.get().rstrip("/")
        threading.Thread(target=self.submit_ocr_worker, args=(api_url, image.copy()), daemon=True).start()

    def submit_ocr_worker(self, api_url: str, image: Image.Image) -> None:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        files = {"image": ("capture.png", buffer, "image/png")}

        try:
            response = requests.post(f"{api_url}/api/ocr/image", files=files, timeout=120)
            response.raise_for_status()
            payload = response.json()
            ocr = payload.get("ocr", payload)
            terms = [Term.from_payload(term) for term in ocr.get("terms", []) if term.get("text")]
            highlights = [
                highlight
                for highlight in (
                    Highlight.from_payload(element)
                    for element in ocr.get("elements", [])
                    if isinstance(element, dict)
                )
                if highlight is not None
            ]
            raw_text = str(ocr.get("rawText") or ocr.get("raw_text") or "")
            self.root.after(0, lambda: self.apply_ocr_result(raw_text, terms, highlights, image))
        except Exception as exc:
            self.root.after(0, lambda exc=exc: self.show_ocr_error(exc))

    def apply_ocr_result(
        self,
        raw_text: str,
        terms: list[Term],
        highlights: list[Highlight],
        image: Image.Image,
    ) -> None:
        self.last_terms = terms
        self.last_highlights = highlights
        self.last_image = image
        self.render_result(raw_text, self.last_terms, self.last_highlights, image)
        if not raw_text.strip():
            self.status.set("No text found. Try a tighter crop, larger text, or the EasyOCR backend.")
        else:
            self.status.set(f"OCR complete: {len(self.last_terms)} terms, {len(self.last_highlights)} highlights")

    def show_ocr_error(self, exc: Exception) -> None:
        messagebox.showerror("OCR failed", str(exc))
        self.status.set(f"OCR failed: {exc}")

    def render_result(
        self,
        raw_text: str,
        terms: list[Term],
        highlights: list[Highlight],
        image: Image.Image,
    ) -> None:
        self.render_preview(image, highlights)
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", raw_text)

        for child in self.terms_frame.winfo_children():
            child.destroy()

        self.term_vars = []
        if not terms:
            ttk.Label(self.terms_frame, text="No term candidates returned.").pack(anchor=tk.W)
            return

        for term in terms:
            var = tk.BooleanVar(value=term.term_type in {"kanji", "word", "phrase"})
            self.term_vars.append(var)
            label = f"{term.text}  [{term.term_type}]"
            ttk.Checkbutton(self.terms_frame, text=label, variable=var).pack(anchor=tk.W, pady=2)

    def render_preview(self, image: Image.Image, highlights: list[Highlight]) -> None:
        self.preview_canvas.delete("all")
        self.preview_canvas.update_idletasks()

        max_width = max(self.preview_canvas.winfo_width(), 640)
        max_height = 260
        scale = min(max_width / image.width, max_height / image.height, 1.0)
        preview_size = (max(1, int(image.width * scale)), max(1, int(image.height * scale)))
        preview = image.resize(preview_size)
        self.preview_photo = ImageTk.PhotoImage(preview)
        self.preview_canvas.configure(height=preview_size[1])
        self.preview_canvas.create_image(0, 0, anchor=tk.NW, image=self.preview_photo)

        for highlight in highlights:
            bbox = highlight.bbox
            x1 = bbox["x"] * scale
            y1 = bbox["y"] * scale
            x2 = (bbox["x"] + bbox["width"]) * scale
            y2 = (bbox["y"] + bbox["height"]) * scale
            color = "#ffd166" if highlight.element_type == "kanji" else "#50e3c2"
            self.preview_canvas.create_rectangle(x1, y1, x2, y2, outline=color, width=2)
            if highlight.text and bbox["width"] * scale > 18:
                self.preview_canvas.create_text(
                    x1 + 3,
                    max(2, y1 - 14),
                    anchor=tk.NW,
                    text=highlight.text,
                    fill=color,
                    font=("TkDefaultFont", 10, "bold"),
                )

        if not highlights:
            self.preview_canvas.create_rectangle(0, 0, preview_size[0], preview_size[1], outline="#d65f5f", width=2)
            self.preview_canvas.create_text(
                12,
                12,
                anchor=tk.NW,
                text="No OCR boxes returned. Restart OCR with EasyOCR/auto for highlights, or try a tighter crop.",
                fill="#ffd166",
                width=max(200, preview_size[0] - 24),
            )

    def add_selected_terms(self) -> None:
        if self.selected_resource_id is None:
            messagebox.showwarning("No resource", "Select a resource before adding terms.")
            return

        selected = [
            term.to_api()
            for term, var in zip(self.last_terms, self.term_vars)
            if var.get()
        ]
        if not selected:
            self.status.set("No terms selected")
            return

        resource_id = self.selected_resource_id
        api_url = self.api_url.get().rstrip("/")
        self.status.set("Adding selected terms...")
        threading.Thread(
            target=self.add_selected_terms_worker,
            args=(api_url, resource_id, selected),
            daemon=True,
        ).start()

    def add_selected_terms_worker(
        self,
        api_url: str,
        resource_id: int,
        selected: list[dict[str, Any]],
    ) -> None:
        try:
            response = requests.post(
                f"{api_url}/api/resources/{resource_id}/terms/bulk",
                json={"terms": selected},
                timeout=20,
            )
            response.raise_for_status()
            self.root.after(0, lambda: self.status.set(f"Added {len(selected)} terms to tracker"))
        except Exception as exc:
            self.root.after(0, lambda exc=exc: self.status.set(f"Could not add terms: {exc}"))

    def run(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)
        self.root.mainloop()

    def shutdown(self) -> None:
        self.save_config()
        if self.hotkey_listener is not None:
            self.hotkey_listener.stop()
        self.root.destroy()


class RegionSelector:
    def __init__(self, root: tk.Tk, callback) -> None:
        self.callback = callback
        self.start_x = 0
        self.start_y = 0
        self.rect_id: int | None = None

        self.window = tk.Toplevel(root)
        self.window.attributes("-fullscreen", True)
        self.window.attributes("-alpha", 0.25)
        self.window.attributes("-topmost", True)
        self.window.configure(bg="black")
        self.window.bind("<Escape>", self.cancel)

        self.canvas = tk.Canvas(self.window, cursor="crosshair", bg="black", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)

    def on_press(self, event) -> None:
        self.start_x = event.x_root
        self.start_y = event.y_root
        self.rect_id = self.canvas.create_rectangle(event.x, event.y, event.x, event.y, outline="red", width=3)

    def on_drag(self, event) -> None:
        if self.rect_id is None:
            return
        local_start_x = self.start_x - self.window.winfo_rootx()
        local_start_y = self.start_y - self.window.winfo_rooty()
        self.canvas.coords(self.rect_id, local_start_x, local_start_y, event.x, event.y)

    def on_release(self, event) -> None:
        left = min(self.start_x, event.x_root)
        top = min(self.start_y, event.y_root)
        width = abs(event.x_root - self.start_x)
        height = abs(event.y_root - self.start_y)
        if width < 8 or height < 8:
            self.finish(None)
            return
        self.window.withdraw()
        self.window.update_idletasks()
        self.window.after(
            120,
            lambda: self.finish({"left": left, "top": top, "width": width, "height": height}),
        )

    def cancel(self, _event) -> None:
        self.finish(None)

    def finish(self, rect: dict[str, int] | None) -> None:
        self.window.destroy()
        self.callback(rect)


def main() -> None:
    try:
        OverlayApp().run()
    except KeyboardInterrupt:
        return
    except Exception as exc:
        print(f"Overlay failed: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
