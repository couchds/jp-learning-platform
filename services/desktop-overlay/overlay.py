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
from pynput import keyboard, mouse
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
        self.screen_overlay: ScreenReviewOverlay | None = None
        self.capture_sequence = 0
        self.active_capture_id = 0
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
            text="Press the hotkey to scan the screen, review highlighted Japanese text, then save useful terms.",
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
        ttk.Button(action_frame, text="Scan Screen", command=self.scan_screen).pack(side=tk.LEFT)
        ttk.Button(action_frame, text="Capture Region", command=self.capture_region).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(action_frame, text="Save selected terms", command=self.add_selected_terms).pack(side=tk.LEFT, padx=8)
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
        self.root.after(0, self.scan_screen)

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

    def next_capture_id(self) -> int:
        self.capture_sequence += 1
        self.active_capture_id = self.capture_sequence
        return self.active_capture_id

    def invalidate_capture(self) -> None:
        self.capture_sequence += 1
        self.active_capture_id = self.capture_sequence

    def scan_screen(self) -> None:
        if self.screen_overlay is not None:
            self.screen_overlay.close(show_control_panel=False)
        capture_id = self.next_capture_id()
        self.root.withdraw()
        self.status.set("Scanning screen...")
        self.root.after(120, lambda: self.scan_screen_after_hide(capture_id))

    def scan_screen_after_hide(self, capture_id: int) -> None:
        if capture_id != self.active_capture_id:
            return
        try:
            image = self.capture_screen()
            status = "Running OCR on screen..."
            if self.image_looks_blank(image):
                status = "Running OCR... Capture looks blank; macOS may need Screen Recording permission."
            self.screen_overlay = ScreenReviewOverlay(
                self.root,
                image,
                self.close_screen_overlay,
                self.add_terms_from_screen_overlay,
                self.capture_region,
            )
            self.submit_ocr(image, status, capture_id, self.screen_overlay)
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror("Screen scan failed", str(exc))
            self.status.set(f"Screen scan failed: {exc}")

    def capture_region(self) -> None:
        if self.screen_overlay is not None:
            self.screen_overlay.close(show_control_panel=False)
        capture_id = self.next_capture_id()
        self.root.withdraw()
        self.status.set("Drag a region to capture")
        RegionSelector(self.root, lambda rect: self.on_region_selected(rect, capture_id))

    def on_region_selected(self, rect: dict[str, int] | None, capture_id: int) -> None:
        if capture_id != self.active_capture_id:
            return
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
            self.submit_ocr(image, status, capture_id)
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror("Capture failed", str(exc))
            self.status.set(f"Capture failed: {exc}")

    def capture_rect(self, rect: dict[str, int]) -> Image.Image:
        with mss.mss() as screen:
            grabbed = screen.grab(rect)
            return Image.frombytes("RGB", grabbed.size, grabbed.rgb)

    def capture_screen(self) -> Image.Image:
        with mss.mss() as screen:
            monitor = self.monitor_under_pointer(screen.monitors)
            grabbed = screen.grab(monitor)
            return Image.frombytes("RGB", grabbed.size, grabbed.rgb)

    def monitor_under_pointer(self, monitors: list[dict[str, int]]) -> dict[str, int]:
        pointer_x, pointer_y = mouse.Controller().position
        for monitor in monitors[1:]:
            left = monitor["left"]
            top = monitor["top"]
            if left <= pointer_x < left + monitor["width"] and top <= pointer_y < top + monitor["height"]:
                return monitor

        return monitors[1] if len(monitors) > 1 else monitors[0]

    def image_looks_blank(self, image: Image.Image) -> bool:
        extrema = ImageStat.Stat(image.convert("L")).extrema[0]
        return (extrema[1] - extrema[0]) < 4

    def submit_ocr(
        self,
        image: Image.Image,
        status: str,
        capture_id: int,
        target_overlay: ScreenReviewOverlay | None = None,
    ) -> None:
        self.status.set(status)
        api_url = self.api_url.get().rstrip("/")
        threading.Thread(
            target=self.submit_ocr_worker,
            args=(api_url, image.copy(), capture_id, target_overlay),
            daemon=True,
        ).start()

    def submit_ocr_worker(
        self,
        api_url: str,
        image: Image.Image,
        capture_id: int,
        target_overlay: ScreenReviewOverlay | None,
    ) -> None:
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
            self.root.after(0, lambda: self.apply_ocr_result(capture_id, target_overlay, raw_text, terms, highlights, image))
        except Exception as exc:
            self.root.after(0, lambda exc=exc: self.show_ocr_error(capture_id, target_overlay, exc))

    def apply_ocr_result(
        self,
        capture_id: int,
        target_overlay: ScreenReviewOverlay | None,
        raw_text: str,
        terms: list[Term],
        highlights: list[Highlight],
        image: Image.Image,
    ) -> None:
        if capture_id != self.active_capture_id:
            return
        self.last_terms = terms
        self.last_highlights = highlights
        self.last_image = image
        self.render_result(raw_text, self.last_terms, self.last_highlights, image)
        if not raw_text.strip():
            self.status.set("No text found. Try a tighter crop, larger text, or the EasyOCR backend.")
        else:
            self.status.set(f"OCR complete: {len(self.last_terms)} terms, {len(self.last_highlights)} highlights")
        if target_overlay is not None and target_overlay is self.screen_overlay:
            target_overlay.apply_result(raw_text, terms, highlights)

    def show_ocr_error(
        self,
        capture_id: int,
        target_overlay: ScreenReviewOverlay | None,
        exc: Exception,
    ) -> None:
        if capture_id != self.active_capture_id:
            return
        if target_overlay is not None and target_overlay is self.screen_overlay:
            target_overlay.show_error(str(exc))
        else:
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
            term
            for term, var in zip(self.last_terms, self.term_vars)
            if var.get()
        ]
        if not selected:
            self.status.set("No terms selected")
            return

        self.add_terms(selected)

    def add_terms_from_screen_overlay(self, terms: list[Term], overlay: ScreenReviewOverlay) -> bool:
        if self.selected_resource_id is None:
            overlay.finish_add("Select a resource in the control panel before adding terms.")
            return False
        return self.add_terms(terms, overlay)

    def add_terms(self, terms: list[Term], overlay: ScreenReviewOverlay | None = None) -> bool:
        resource_id = self.selected_resource_id
        if resource_id is None:
            return False

        selected = [term.to_api() for term in terms]
        api_url = self.api_url.get().rstrip("/")
        self.status.set("Adding selected terms...")
        threading.Thread(
            target=self.add_selected_terms_worker,
            args=(api_url, resource_id, selected, overlay),
            daemon=True,
        ).start()
        return True

    def add_selected_terms_worker(
        self,
        api_url: str,
        resource_id: int,
        selected: list[dict[str, Any]],
        overlay: ScreenReviewOverlay | None,
    ) -> None:
        try:
            response = requests.post(
                f"{api_url}/api/resources/{resource_id}/terms/bulk",
                json={"terms": selected},
                timeout=20,
            )
            response.raise_for_status()
            self.root.after(0, lambda: self.finish_add_terms(overlay, f"Added {len(selected)} terms to tracker"))
        except Exception as exc:
            self.root.after(0, lambda exc=exc: self.finish_add_terms(overlay, f"Could not add terms: {exc}"))

    def finish_add_terms(self, overlay: ScreenReviewOverlay | None, message: str) -> None:
        self.status.set(message)
        if overlay is not None and overlay is self.screen_overlay:
            overlay.finish_add(message)

    def close_screen_overlay(self, show_control_panel: bool = True) -> None:
        self.screen_overlay = None
        self.invalidate_capture()
        if show_control_panel:
            self.root.deiconify()

    def run(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)
        self.root.mainloop()

    def shutdown(self) -> None:
        self.save_config()
        if self.hotkey_listener is not None:
            self.hotkey_listener.stop()
        self.root.destroy()


class ScreenReviewOverlay:
    def __init__(
        self,
        root: tk.Tk,
        image: Image.Image,
        on_close,
        on_add_selected,
        on_precise_region,
    ) -> None:
        self.root = root
        self.image = image
        self.on_close = on_close
        self.on_add_selected = on_add_selected
        self.on_precise_region = on_precise_region
        self.highlights: list[Highlight] = []
        self.terms: list[Term] = []
        self.photo: ImageTk.PhotoImage | None = None
        self.image_offset = (0, 0)
        self.image_scale = 1.0
        self.loaded = False
        self.saving = False

        self.window = tk.Toplevel(root)
        self.window.title("Yomunami Screen OCR")
        self.window.configure(bg="#10100f")
        self.window.attributes("-fullscreen", True)
        self.window.attributes("-topmost", True)
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.window.bind("<Escape>", lambda _event: self.close())
        self.window.bind("<Return>", lambda _event: self.add_selected())

        self.status = tk.StringVar(value="Scanning screen...")
        self.build_ui()
        self.window.after(50, self.render_screen)

    def build_ui(self) -> None:
        topbar = tk.Frame(self.window, bg="#181712", height=48)
        topbar.pack(fill=tk.X, side=tk.TOP)
        topbar.pack_propagate(False)

        tk.Label(
            topbar,
            text="Yomunami OCR",
            bg="#181712",
            fg="#f8efe0",
            font=("TkDefaultFont", 16, "bold"),
        ).pack(side=tk.LEFT, padx=16)
        tk.Label(topbar, textvariable=self.status, bg="#181712", fg="#d4c8b5").pack(side=tk.LEFT, padx=10)
        tk.Button(topbar, text="Close", command=self.close).pack(side=tk.RIGHT, padx=(6, 14), pady=8)
        tk.Button(topbar, text="Precise Region", command=self.precise_region).pack(side=tk.RIGHT, padx=6, pady=8)
        tk.Button(topbar, text="Save selected terms", command=self.add_selected).pack(side=tk.RIGHT, padx=6, pady=8)

        body = tk.Frame(self.window, bg="#080807")
        body.pack(fill=tk.BOTH, expand=True)

        self.canvas = tk.Canvas(body, bg="#080807", highlightthickness=0)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.canvas.bind("<Configure>", lambda _event: self.render_screen())

        side = tk.Frame(body, bg="#151411", width=320)
        side.pack(side=tk.RIGHT, fill=tk.Y)
        side.pack_propagate(False)

        tk.Label(
            side,
            text="Terms to save",
            bg="#151411",
            fg="#f8efe0",
            font=("TkDefaultFont", 13, "bold"),
        ).pack(anchor=tk.W, padx=12, pady=(12, 4))
        tk.Label(
            side,
            text="Selected rows are saved to the resource chosen in the control panel.",
            bg="#151411",
            fg="#d4c8b5",
            wraplength=292,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, padx=12, pady=(0, 8))
        self.terms_list = tk.Listbox(
            side,
            selectmode=tk.MULTIPLE,
            bg="#201f1a",
            fg="#f8efe0",
            selectbackground="#3f6b62",
            selectforeground="#ffffff",
            highlightthickness=0,
            activestyle="none",
        )
        self.terms_list.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 12))

        tk.Label(
            side,
            text="OCR text",
            bg="#151411",
            fg="#f8efe0",
            font=("TkDefaultFont", 13, "bold"),
        ).pack(anchor=tk.W, padx=12, pady=(0, 4))
        self.raw_text = tk.Text(
            side,
            height=9,
            wrap=tk.WORD,
            bg="#201f1a",
            fg="#f8efe0",
            insertbackground="#f8efe0",
            highlightthickness=0,
        )
        self.raw_text.pack(fill=tk.X, padx=12, pady=(0, 12))
        self.raw_text.insert("1.0", "Scanning...")

    def apply_result(self, raw_text: str, terms: list[Term], highlights: list[Highlight]) -> None:
        self.loaded = True
        self.terms = terms
        self.highlights = highlights
        self.status.set(f"{len(highlights)} highlights, {len(terms)} terms")
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", raw_text or "No text found.")
        self.terms_list.delete(0, tk.END)
        for index, term in enumerate(self.terms):
            self.terms_list.insert(tk.END, f"{term.text}  [{term.term_type}]")
            if term.term_type in {"kanji", "word", "phrase"}:
                self.terms_list.selection_set(index)
        self.render_screen()

    def show_error(self, message: str) -> None:
        self.loaded = True
        self.status.set(f"OCR failed: {message}")
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", message)
        self.render_screen()

    def finish_add(self, message: str) -> None:
        self.saving = False
        if self.window.winfo_exists():
            self.status.set(message)

    def render_screen(self) -> None:
        width = max(self.canvas.winfo_width(), 1)
        height = max(self.canvas.winfo_height(), 1)
        self.canvas.delete("all")

        scale = min(width / self.image.width, height / self.image.height, 1.0)
        preview_size = (max(1, int(self.image.width * scale)), max(1, int(self.image.height * scale)))
        preview = self.image.resize(preview_size)
        self.photo = ImageTk.PhotoImage(preview)
        offset_x = int((width - preview_size[0]) / 2)
        offset_y = int((height - preview_size[1]) / 2)
        self.image_offset = (offset_x, offset_y)
        self.image_scale = scale

        self.canvas.create_image(offset_x, offset_y, anchor=tk.NW, image=self.photo)

        for highlight in self.highlights:
            self.draw_highlight(highlight)

        if not self.loaded:
            self.canvas.create_rectangle(20, 20, 260, 72, fill="#181712", outline="#4b463c")
            self.canvas.create_text(36, 36, anchor=tk.NW, text="Scanning screen...", fill="#f8efe0")
        elif not self.highlights:
            self.canvas.create_rectangle(20, 20, 420, 78, fill="#181712", outline="#d65f5f")
            self.canvas.create_text(
                36,
                36,
                anchor=tk.NW,
                text="No OCR highlights found. Try Precise Region for a tighter crop.",
                fill="#ffd166",
            )

    def draw_highlight(self, highlight: Highlight) -> None:
        x_offset, y_offset = self.image_offset
        scale = self.image_scale
        bbox = highlight.bbox
        x1 = x_offset + bbox["x"] * scale
        y1 = y_offset + bbox["y"] * scale
        x2 = x_offset + (bbox["x"] + bbox["width"]) * scale
        y2 = y_offset + (bbox["y"] + bbox["height"]) * scale
        color = "#ffd166" if highlight.element_type == "kanji" else "#50e3c2"
        self.canvas.create_rectangle(x1, y1, x2, y2, outline=color, width=2)
        if highlight.text and (x2 - x1) > 24:
            self.canvas.create_text(
                x1 + 3,
                max(y_offset + 3, y1 - 15),
                anchor=tk.NW,
                text=highlight.text,
                fill=color,
                font=("TkDefaultFont", 10, "bold"),
            )

    def selected_terms(self) -> list[Term]:
        return [self.terms[index] for index in self.terms_list.curselection()]

    def add_selected(self) -> None:
        if self.saving:
            self.status.set("Already adding selected terms...")
            return
        selected = self.selected_terms()
        if not selected:
            self.status.set("No terms selected")
            return
        accepted = self.on_add_selected(selected, self)
        if accepted:
            self.saving = True
            self.status.set(f"Adding {len(selected)} selected terms...")

    def precise_region(self) -> None:
        start_precise_region = self.on_precise_region
        self.close(show_control_panel=False)
        self.root.after(180, start_precise_region)

    def close(self, show_control_panel: bool = True) -> None:
        if self.window.winfo_exists():
            self.window.destroy()
        self.root.update_idletasks()
        self.on_close(show_control_panel)


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
        self.canvas.create_text(
            28,
            28,
            anchor=tk.NW,
            text="Click and drag over the Japanese text. Press Esc to cancel.",
            fill="white",
            font=("TkDefaultFont", 18, "bold"),
        )
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.window.after(30, self.focus)

    def focus(self) -> None:
        self.window.lift()
        self.window.focus_force()
        self.canvas.focus_set()

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
