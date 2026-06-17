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
import traceback
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
LOG_PATH = Path.home() / ".yomunami-overlay.log"
DEFAULT_API_URL = os.environ.get("YOMUNAMI_API_URL", "http://127.0.0.1:3001")
DEFAULT_WEB_URL = os.environ.get("YOMUNAMI_WEB_URL", "http://127.0.0.1:5173")
DEFAULT_HOTKEY = "ctrl+shift+o"
UI_FONT = "Segoe UI" if sys.platform == "win32" else "TkDefaultFont"
JP_FONT = "Yu Gothic UI" if sys.platform == "win32" else "TkDefaultFont"

REVIEW_BG = "#0e1413"
REVIEW_STAGE = "#090f0e"
REVIEW_SURFACE = "#f5efe5"
REVIEW_SURFACE_ALT = "#fffbf4"
REVIEW_TEXT = "#1b201f"
REVIEW_MUTED = "#67706c"
REVIEW_BORDER = "#d9d0c3"
REVIEW_PRIMARY = "#19b394"
REVIEW_PRIMARY_DARK = "#0f6d60"
REVIEW_ACCENT = "#f0b84b"
REVIEW_DANGER = "#c24135"


def log_debug(message: str) -> None:
    try:
        with LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(f"{message}\n")
    except Exception:
        return


def image_looks_blank(image: Image.Image) -> bool:
    extrema = ImageStat.Stat(image.convert("L")).extrema[0]
    return (extrema[1] - extrema[0]) < 4


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
        self.root.report_callback_exception = self.report_callback_exception
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
        self.hotkey_lock = threading.Lock()
        self.hotkey_setup_generation = 0

        self.build_ui()
        self.root.after(50, self.startup)

    def report_callback_exception(self, exc_type, exc_value, exc_traceback) -> None:
        log_debug("Tk callback exception:")
        log_debug("".join(traceback.format_exception(exc_type, exc_value, exc_traceback)).rstrip())

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
            text="Scan the current screen, or draw a precise box around Japanese text and release to run OCR.",
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
        ttk.Button(action_frame, text="Scan current screen", command=self.scan_screen).pack(side=tk.LEFT)
        ttk.Button(action_frame, text="Select precise region", command=self.capture_region).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(action_frame, text="Save checked terms", command=self.add_selected_terms).pack(side=tk.LEFT, padx=8)
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
            text="No capture yet. Use Scan current screen, Select precise region, or press the hotkey.",
            style="Muted.TLabel",
        ).pack(anchor=tk.W, pady=6)

        ttk.Label(self.root, textvariable=self.status, relief=tk.SUNKEN, anchor=tk.W).pack(side=tk.BOTTOM, fill=tk.X)

    def startup(self) -> None:
        self.root.update_idletasks()
        self.refresh_resources()
        self.root.after(250, self.start_hotkey_listener_async)

    def apply_settings(self) -> None:
        self.save_config()
        self.start_hotkey_listener_async()

    def start_hotkey_listener_async(self) -> None:
        hotkey_text = self.hotkey.get().strip() or DEFAULT_HOTKEY
        with self.hotkey_lock:
            self.hotkey_setup_generation += 1
            generation = self.hotkey_setup_generation
        self.status.set(f"Starting hotkey {hotkey_text}...")
        threading.Thread(target=self.start_hotkey_listener_worker, args=(hotkey_text, generation), daemon=True).start()

    def start_hotkey_listener_worker(self, hotkey_text: str, generation: int) -> None:
        listener: keyboard.GlobalHotKeys | None = None
        try:
            pynput_hotkey = self.to_pynput_hotkey(hotkey_text)
            listener = keyboard.GlobalHotKeys({pynput_hotkey: self.hotkey_capture})
            listener.start()

            old_listener: keyboard.GlobalHotKeys | None = None
            with self.hotkey_lock:
                if generation != self.hotkey_setup_generation:
                    listener.stop()
                    return
                old_listener = self.hotkey_listener
                self.hotkey_listener = listener

            if old_listener is not None:
                old_listener.stop()
            self.root.after(0, lambda: self.status.set(f"Hotkey set to {hotkey_text}"))
        except Exception as exc:
            if listener is not None:
                listener.stop()
            self.root.after(0, lambda exc=exc: self.status.set(f"Hotkey listener unavailable: {exc}"))

    def open_web_app(self) -> None:
        webbrowser.open(self.web_url.get().rstrip("/") or DEFAULT_WEB_URL)

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
            self.screen_overlay = ScreenReviewOverlay(
                self.root,
                image,
                self.close_screen_overlay,
                self.add_terms_from_screen_overlay,
                self.capture_region,
            )
            if self.image_looks_blank(image):
                message = self.blank_capture_message()
                self.status.set(message)
                self.screen_overlay.show_capture_problem(message)
                return
            status = "Running OCR on screen..."
            self.submit_ocr(image, status, capture_id, self.screen_overlay)
        except Exception as exc:
            self.root.deiconify()
            log_debug(f"Screen scan failed: {exc}")
            messagebox.showerror("Screen scan failed", str(exc))
            self.status.set(f"Screen scan failed: {exc}")

    def capture_region(self) -> None:
        if self.screen_overlay is not None:
            self.screen_overlay.close(show_control_panel=False)
        capture_id = self.next_capture_id()
        self.root.withdraw()
        self.status.set("Opening precise region selector...")
        self.root.after(140, lambda: self.start_region_selector(capture_id))

    def start_region_selector(self, capture_id: int) -> None:
        if capture_id != self.active_capture_id:
            return
        try:
            RegionSelector(self.root, lambda rect: self.on_region_selected(rect, capture_id))
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror("Region selector failed", str(exc))
            self.status.set(f"Region selector failed: {exc}")

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
                status = self.blank_capture_message()
                messagebox.showwarning("Blank capture", status)
                self.status.set(status)
                return
            self.submit_ocr(image, status, capture_id)
        except Exception as exc:
            self.root.deiconify()
            log_debug(f"Capture failed: {exc}")
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
        return image_looks_blank(image)

    def blank_capture_message(self) -> str:
        return (
            "Screen capture is blank. macOS likely has not granted Screen Recording permission "
            "to Python or the launcher. Grant permission, quit the overlay, then launch it again."
        )

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
        with self.hotkey_lock:
            self.hotkey_setup_generation += 1
            hotkey_listener = self.hotkey_listener
            self.hotkey_listener = None
        if hotkey_listener is not None:
            hotkey_listener.stop()
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
        self.capture_problem: str | None = None

        self.window = tk.Toplevel(root)
        self.window.title("Yomunami Screen OCR")
        self.window.configure(bg=REVIEW_BG)
        self.window.attributes("-fullscreen", True)
        self.window.attributes("-topmost", True)
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.window.bind("<Escape>", lambda _event: self.close())
        self.window.bind("<Return>", lambda _event: self.add_selected())

        self.status = tk.StringVar(value="Scanning screen...")
        self.selected_count = tk.StringVar(value="0 selected")
        self.build_ui()
        self.window.after(50, self.render_screen)

    def build_ui(self) -> None:
        topbar = tk.Frame(self.window, bg=REVIEW_BG, height=74)
        topbar.pack(fill=tk.X, side=tk.TOP)
        topbar.pack_propagate(False)

        brand = tk.Frame(topbar, bg=REVIEW_BG)
        brand.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=20, pady=10)
        tk.Label(
            brand,
            text="Yomunami OCR",
            bg=REVIEW_BG,
            fg="#fff7eb",
            font=(UI_FONT, 19, "bold"),
        ).pack(anchor=tk.W)
        tk.Label(
            brand,
            text="Screen review - verify highlights, choose terms, save to your resource",
            bg=REVIEW_BG,
            fg="#9db0aa",
            font=(UI_FONT, 10),
        ).pack(anchor=tk.W, pady=(2, 0))

        status_chip = tk.Label(
            topbar,
            textvariable=self.status,
            bg="#1c2b28",
            fg="#b9f6e7",
            width=34,
            anchor=tk.W,
            padx=14,
            pady=7,
            font=(UI_FONT, 10, "bold"),
        )
        status_chip.pack(side=tk.LEFT, padx=(0, 16))

        button_bar = tk.Frame(topbar, bg=REVIEW_BG)
        button_bar.pack(side=tk.RIGHT, padx=18)
        self.overlay_button(button_bar, "Close", self.close, "ghost").pack(side=tk.RIGHT)
        self.overlay_button(button_bar, "Tighter region", self.precise_region, "secondary").pack(
            side=tk.RIGHT,
            padx=(0, 8),
        )
        self.overlay_button(button_bar, "Save selected", self.add_selected, "primary").pack(side=tk.RIGHT, padx=(0, 8))

        body = tk.Frame(self.window, bg=REVIEW_BG)
        body.pack(fill=tk.BOTH, expand=True)

        stage = tk.Frame(body, bg=REVIEW_STAGE)
        stage.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(16, 10), pady=(0, 16))
        self.canvas = tk.Canvas(stage, bg=REVIEW_STAGE, highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.bind("<Configure>", lambda _event: self.render_screen())

        side = tk.Frame(body, bg=REVIEW_SURFACE, width=382)
        side.pack(side=tk.RIGHT, fill=tk.Y, padx=(0, 16), pady=(0, 16))
        side.pack_propagate(False)

        side_header = tk.Frame(side, bg=REVIEW_SURFACE)
        side_header.pack(fill=tk.X, padx=18, pady=(18, 8))
        tk.Label(
            side_header,
            text="Terms",
            bg=REVIEW_SURFACE,
            fg=REVIEW_TEXT,
            font=(UI_FONT, 17, "bold"),
        ).pack(side=tk.LEFT)
        tk.Label(
            side_header,
            textvariable=self.selected_count,
            bg="#e8ded0",
            fg="#4c5853",
            padx=10,
            pady=4,
            font=(UI_FONT, 9, "bold"),
        ).pack(side=tk.RIGHT)
        tk.Label(
            side,
            text="Selected rows are saved to the resource chosen in the control panel.",
            bg=REVIEW_SURFACE,
            fg=REVIEW_MUTED,
            wraplength=336,
            justify=tk.LEFT,
            font=(UI_FONT, 9),
        ).pack(anchor=tk.W, padx=18, pady=(0, 12))

        terms_box = tk.Frame(side, bg=REVIEW_SURFACE_ALT, highlightbackground=REVIEW_BORDER, highlightthickness=1)
        terms_box.pack(fill=tk.BOTH, expand=True, padx=18, pady=(0, 16))
        self.terms_list = tk.Listbox(
            terms_box,
            selectmode=tk.MULTIPLE,
            bg=REVIEW_SURFACE_ALT,
            fg=REVIEW_TEXT,
            selectbackground=REVIEW_PRIMARY_DARK,
            selectforeground="#ffffff",
            highlightthickness=0,
            activestyle="none",
            relief=tk.FLAT,
            borderwidth=0,
            font=(JP_FONT, 10),
            exportselection=False,
        )
        terms_scrollbar = tk.Scrollbar(terms_box, orient=tk.VERTICAL, command=self.terms_list.yview)
        self.terms_list.configure(yscrollcommand=terms_scrollbar.set)
        self.terms_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
        terms_scrollbar.pack(side=tk.RIGHT, fill=tk.Y, padx=(4, 8), pady=10)
        self.terms_list.bind("<<ListboxSelect>>", lambda _event: self.update_selected_count())

        tk.Label(
            side,
            text="OCR text",
            bg=REVIEW_SURFACE,
            fg=REVIEW_TEXT,
            font=(UI_FONT, 13, "bold"),
        ).pack(anchor=tk.W, padx=18, pady=(0, 6))
        raw_box = tk.Frame(side, bg=REVIEW_SURFACE_ALT, highlightbackground=REVIEW_BORDER, highlightthickness=1)
        raw_box.pack(fill=tk.X, padx=18, pady=(0, 18))
        self.raw_text = tk.Text(
            raw_box,
            height=8,
            wrap=tk.WORD,
            bg=REVIEW_SURFACE_ALT,
            fg=REVIEW_TEXT,
            insertbackground=REVIEW_TEXT,
            highlightthickness=0,
            relief=tk.FLAT,
            borderwidth=0,
            padx=10,
            pady=10,
            font=(JP_FONT, 10),
        )
        self.raw_text.pack(fill=tk.X)
        self.raw_text.insert("1.0", "Scanning...")

    def overlay_button(self, parent: tk.Widget, text: str, command, variant: str) -> tk.Button:
        styles = {
            "primary": (REVIEW_PRIMARY, "#06221d", "#37d7b7"),
            "secondary": ("#243733", "#dff8ef", "#315049"),
            "ghost": ("#17201f", "#d8e2de", "#263230"),
        }
        bg, fg, active_bg = styles.get(variant, styles["secondary"])
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=active_bg,
            activeforeground=fg,
            relief=tk.FLAT,
            borderwidth=0,
            highlightthickness=0,
            padx=15,
            pady=8,
            font=(UI_FONT, 10, "bold"),
            cursor="hand2",
        )

    def apply_result(self, raw_text: str, terms: list[Term], highlights: list[Highlight]) -> None:
        self.loaded = True
        self.terms = terms
        self.highlights = highlights
        self.status.set(f"{len(highlights)} highlights, {len(terms)} terms")
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", raw_text or "No text found.")
        self.terms_list.delete(0, tk.END)
        for index, term in enumerate(self.terms):
            self.terms_list.insert(tk.END, self.term_label(term))
            row_bg, row_fg = self.term_row_colors(term, index)
            self.terms_list.itemconfig(index, background=row_bg, foreground=row_fg)
            if term.term_type in {"kanji", "word", "vocabulary", "phrase"}:
                self.terms_list.selection_set(index)
        self.update_selected_count()
        self.render_screen()

    def show_error(self, message: str) -> None:
        self.loaded = True
        self.status.set(f"OCR failed: {message}")
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", message)
        self.terms_list.delete(0, tk.END)
        self.update_selected_count()
        self.render_screen()

    def show_capture_problem(self, message: str) -> None:
        self.loaded = True
        self.capture_problem = message
        self.status.set("Screen capture needs permission")
        self.raw_text.delete("1.0", tk.END)
        self.raw_text.insert("1.0", message)
        self.terms_list.delete(0, tk.END)
        self.update_selected_count()
        self.render_screen()

    def term_label(self, term: Term) -> str:
        label = f"{term.text}    {term.term_type.upper()}"
        if term.reading:
            label = f"{label}    {term.reading}"
        return label

    def term_row_colors(self, term: Term, index: int) -> tuple[str, str]:
        if term.term_type == "kanji":
            return "#fff3cf", "#533a00"
        if term.term_type in {"word", "vocabulary", "phrase"}:
            return "#e7f8f3", "#123d35"
        if term.term_type in {"hiragana", "katakana", "kana"}:
            return "#fffaf0", "#514839"
        if index % 2:
            return "#f4efe6", "#5d6662"
        return REVIEW_SURFACE_ALT, "#5d6662"

    def update_selected_count(self) -> None:
        selected = len(self.terms_list.curselection())
        total = self.terms_list.size()
        self.selected_count.set(f"{selected} of {total} selected" if total else "0 selected")

    def finish_add(self, message: str) -> None:
        self.saving = False
        if self.window.winfo_exists():
            self.status.set(message)

    def render_screen(self) -> None:
        width = max(self.canvas.winfo_width(), 1)
        height = max(self.canvas.winfo_height(), 1)
        self.canvas.delete("all")
        self.canvas.create_rectangle(0, 0, width, height, fill=REVIEW_STAGE, outline="")

        scale = min(width / self.image.width, height / self.image.height, 1.0)
        preview_size = (max(1, int(self.image.width * scale)), max(1, int(self.image.height * scale)))
        preview = self.image.resize(preview_size)
        self.photo = ImageTk.PhotoImage(preview)
        offset_x = int((width - preview_size[0]) / 2)
        offset_y = int((height - preview_size[1]) / 2)
        self.image_offset = (offset_x, offset_y)
        self.image_scale = scale

        shadow = 10
        self.canvas.create_rectangle(
            offset_x + shadow,
            offset_y + shadow,
            offset_x + preview_size[0] + shadow,
            offset_y + preview_size[1] + shadow,
            fill="#050807",
            outline="",
        )
        self.canvas.create_rectangle(
            offset_x - 1,
            offset_y - 1,
            offset_x + preview_size[0] + 1,
            offset_y + preview_size[1] + 1,
            outline="#263633",
            width=1,
        )
        self.canvas.create_image(offset_x, offset_y, anchor=tk.NW, image=self.photo)

        if self.capture_problem is not None:
            self.draw_capture_problem(width, height)
            return

        for highlight in self.highlights:
            self.draw_highlight(highlight)

        if not self.loaded:
            self.canvas.create_rectangle(24, 24, 318, 88, fill="#111d1a", outline="#38524b", width=1)
            self.canvas.create_text(
                44,
                45,
                anchor=tk.NW,
                text="Scanning screen...",
                fill="#e9fff8",
                font=(UI_FONT, 14, "bold"),
            )
        elif not self.highlights:
            self.canvas.create_rectangle(24, 24, 570, 98, fill="#fff8ef", outline=REVIEW_DANGER, width=2)
            self.canvas.create_text(
                44,
                43,
                anchor=tk.NW,
                text="No OCR highlights found. Try Select tighter region for a snug crop.",
                fill=REVIEW_TEXT,
                font=(UI_FONT, 12, "bold"),
            )

    def draw_capture_problem(self, width: int, height: int) -> None:
        box_width = min(720, max(360, width - 80))
        box_height = 190
        x1 = int((width - box_width) / 2)
        y1 = max(48, int((height - box_height) / 3))
        self.canvas.create_rectangle(
            x1,
            y1,
            x1 + box_width,
            y1 + box_height,
            fill=REVIEW_SURFACE_ALT,
            outline=REVIEW_DANGER,
            width=3,
        )
        self.canvas.create_text(
            x1 + 24,
            y1 + 22,
            anchor=tk.NW,
            text="Yomunami cannot see your screen yet",
            fill=REVIEW_TEXT,
            font=(UI_FONT, 22, "bold"),
        )
        self.canvas.create_text(
            x1 + 24,
            y1 + 64,
            anchor=tk.NW,
            text=(
                "macOS returned a blank image. Grant Screen Recording permission to Python, "
                "Terminal, or the app that launched the overlay, then quit and relaunch the overlay."
            ),
            fill=REVIEW_TEXT,
            width=box_width - 48,
            font=(UI_FONT, 14),
        )
        self.canvas.create_text(
            x1 + 24,
            y1 + 132,
            anchor=tk.NW,
            text=f"Diagnostics: {LOG_PATH}",
            fill=REVIEW_MUTED,
            font=(UI_FONT, 12),
        )

    def draw_highlight(self, highlight: Highlight) -> None:
        x_offset, y_offset = self.image_offset
        scale = self.image_scale
        bbox = highlight.bbox
        x1 = x_offset + bbox["x"] * scale
        y1 = y_offset + bbox["y"] * scale
        x2 = x_offset + (bbox["x"] + bbox["width"]) * scale
        y2 = y_offset + (bbox["y"] + bbox["height"]) * scale
        color = REVIEW_ACCENT if highlight.element_type == "kanji" else REVIEW_PRIMARY
        width = 3 if highlight.element_type in {"kanji", "vocabulary", "word", "phrase"} else 2
        self.canvas.create_rectangle(x1, y1, x2, y2, outline="#07100e", width=width + 1)
        self.canvas.create_rectangle(x1, y1, x2, y2, outline=color, width=width)
        should_label = (
            highlight.text
            and highlight.element_type in {"kanji", "vocabulary", "word", "phrase"}
            and len(highlight.text) <= 8
            and (x2 - x1) > 42
            and (y2 - y1) > 14
        )
        if should_label:
            label_width = min(150, max(34, len(highlight.text) * 12 + 14))
            label_y = max(y_offset + 3, y1 - 22)
            self.canvas.create_rectangle(x1, label_y, x1 + label_width, label_y + 19, fill=color, outline=color)
            self.canvas.create_text(
                x1 + 7,
                label_y + 2,
                anchor=tk.NW,
                text=highlight.text,
                fill="#07100e",
                font=(JP_FONT, 9, "bold"),
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
    MIN_SELECTION_SIZE = 18

    def __init__(self, root: tk.Tk, callback) -> None:
        self.root = root
        self.callback = callback
        self.monitor, self.image = self.capture_reference_screen()
        self.capture_problem = image_looks_blank(self.image)
        self.drag_start: tuple[int, int] | None = None
        self.drag_current: tuple[int, int] | None = None
        self.preview_offset = (0, 0)
        self.preview_size = (1, 1)
        self.preview_scale = 1.0
        self.photo: ImageTk.PhotoImage | None = None
        self.selection_photo: ImageTk.PhotoImage | None = None
        self.rect_id: int | None = None
        self.finished = False
        self.status = tk.StringVar(
            value=(
                "Screen capture is blank. Grant Screen Recording permission, then relaunch."
                if self.capture_problem
                else "Drag a box around the Japanese text, then release to scan."
            )
        )

        self.window = tk.Toplevel(root)
        self.window.title("Yomunami Precise Region")
        self.window.attributes("-topmost", True)
        self.window.attributes("-fullscreen", True)
        self.window.configure(bg="#f7f7f4")
        self.window.bind("<Escape>", self.cancel)
        self.window.protocol("WM_DELETE_WINDOW", self.cancel)

        self.build_ui()
        self.window.after(30, self.focus)

    def capture_reference_screen(self) -> tuple[dict[str, int], Image.Image]:
        self.root.update_idletasks()
        with mss.mss() as screen:
            monitor = self.monitor_under_pointer(screen.monitors)
            grabbed = screen.grab(monitor)
            image = Image.frombytes("RGB", grabbed.size, grabbed.rgb)
            return monitor, image

    def monitor_under_pointer(self, monitors: list[dict[str, int]]) -> dict[str, int]:
        pointer_x, pointer_y = mouse.Controller().position
        for monitor in monitors[1:]:
            left = monitor["left"]
            top = monitor["top"]
            if left <= pointer_x < left + monitor["width"] and top <= pointer_y < top + monitor["height"]:
                return monitor

        return monitors[1] if len(monitors) > 1 else monitors[0]

    def build_ui(self) -> None:
        header = tk.Frame(self.window, bg="#f7f7f4", height=76)
        header.pack(fill=tk.X, side=tk.TOP)
        header.pack_propagate(False)

        title_group = tk.Frame(header, bg="#f7f7f4")
        title_group.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=18, pady=10)
        tk.Label(
            title_group,
            text="Precise OCR region",
            bg="#f7f7f4",
            fg="#181712",
            font=("TkDefaultFont", 18, "bold"),
        ).pack(anchor=tk.W)
        tk.Label(
            title_group,
            textvariable=self.status,
            bg="#f7f7f4",
            fg="#3e3a33",
            font=("TkDefaultFont", 13),
        ).pack(anchor=tk.W, pady=(3, 0))

        tk.Button(
            header,
            text="Cancel",
            command=self.cancel,
            padx=18,
            pady=8,
        ).pack(side=tk.RIGHT, padx=18, pady=14)

        self.canvas = tk.Canvas(self.window, cursor="crosshair", bg="#ffffff", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Configure>", lambda _event: self.render())

        footer = tk.Frame(self.window, bg="#f7f7f4", height=42)
        footer.pack(fill=tk.X, side=tk.BOTTOM)
        footer.pack_propagate(False)
        tk.Label(
            footer,
            text="Tip: make the box snug around the text. Press Esc to cancel.",
            bg="#f7f7f4",
            fg="#3e3a33",
        ).pack(side=tk.LEFT, padx=18)

    def focus(self) -> None:
        self.window.lift()
        self.window.focus_force()
        self.canvas.focus_set()
        self.render()

    def render(self) -> None:
        width = max(self.canvas.winfo_width(), 1)
        height = max(self.canvas.winfo_height(), 1)
        self.canvas.delete("all")

        scale = min(width / self.image.width, height / self.image.height)
        preview_size = (
            max(1, int(self.image.width * scale)),
            max(1, int(self.image.height * scale)),
        )
        preview = self.image.resize(preview_size)
        dimmed = Image.blend(preview, Image.new("RGB", preview_size, "#f7f7f4"), 0.38)
        self.photo = ImageTk.PhotoImage(dimmed)
        offset_x = int((width - preview_size[0]) / 2)
        offset_y = int((height - preview_size[1]) / 2)
        self.preview_offset = (offset_x, offset_y)
        self.preview_size = preview_size
        self.preview_scale = scale
        self.canvas.create_image(offset_x, offset_y, anchor=tk.NW, image=self.photo)

        if self.capture_problem:
            self.draw_capture_problem(width, height)
            return

        self.draw_idle_prompt(width)
        self.draw_selection()

    def draw_capture_problem(self, width: int, height: int) -> None:
        box_width = min(760, max(360, width - 80))
        box_height = 210
        x1 = int((width - box_width) / 2)
        y1 = max(48, int((height - box_height) / 3))
        self.canvas.create_rectangle(x1, y1, x1 + box_width, y1 + box_height, fill="#ffffff", outline="#b3261e", width=3)
        self.canvas.create_text(
            x1 + 24,
            y1 + 24,
            anchor=tk.NW,
            text="The selector cannot see your screen",
            fill="#181712",
            font=("TkDefaultFont", 22, "bold"),
        )
        self.canvas.create_text(
            x1 + 24,
            y1 + 70,
            anchor=tk.NW,
            text=(
                "macOS returned a blank screenshot. Open System Settings > Privacy & Security > "
                "Screen Recording and grant permission to Python, Terminal, or the app that launched Yomunami."
            ),
            fill="#181712",
            width=box_width - 48,
            font=("TkDefaultFont", 14),
        )
        self.canvas.create_text(
            x1 + 24,
            y1 + 150,
            anchor=tk.NW,
            text="After changing permission, quit and relaunch the overlay.",
            fill="#5c5448",
            font=("TkDefaultFont", 13, "bold"),
        )

    def draw_idle_prompt(self, width: int) -> None:
        if self.drag_start is not None:
            return

        box_width = min(560, max(340, width - 48))
        self.canvas.create_rectangle(24, 22, 24 + box_width, 102, fill="#ffffff", outline="#226f68", width=3)
        self.canvas.create_text(
            44,
            40,
            anchor=tk.NW,
            text="Click and drag over the Japanese text.",
            fill="#181712",
            font=("TkDefaultFont", 18, "bold"),
        )
        self.canvas.create_text(
            44,
            68,
            anchor=tk.NW,
            text="Release the mouse to run OCR on that exact box.",
            fill="#3e3a33",
            font=("TkDefaultFont", 13),
        )

    def draw_selection(self) -> None:
        canvas_rect = self.normalized_canvas_rect()
        image_rect = self.selection_image_rect()
        if canvas_rect is None or image_rect is None:
            return

        x1, y1, x2, y2 = canvas_rect
        image_x, image_y, image_width, image_height = image_rect
        if image_width <= 0 or image_height <= 0:
            return

        crop = self.image.crop((image_x, image_y, image_x + image_width, image_y + image_height))
        crop_size = (max(1, int(image_width * self.preview_scale)), max(1, int(image_height * self.preview_scale)))
        self.selection_photo = ImageTk.PhotoImage(crop.resize(crop_size))
        self.canvas.create_image(x1, y1, anchor=tk.NW, image=self.selection_photo)
        self.canvas.create_rectangle(x1, y1, x2, y2, outline="#226f68", width=4)

        handle = 7
        for hx, hy in ((x1, y1), (x2, y1), (x1, y2), (x2, y2)):
            self.canvas.create_rectangle(
                hx - handle,
                hy - handle,
                hx + handle,
                hy + handle,
                fill="#226f68",
                outline="#ffffff",
                width=2,
            )

        label = f"{image_width} x {image_height}px - release to scan"
        label_y = y1 - 34 if y1 > 48 else y2 + 12
        self.canvas.create_rectangle(x1, label_y, x1 + 230, label_y + 26, fill="#ffffff", outline="#226f68", width=2)
        self.canvas.create_text(x1 + 10, label_y + 6, anchor=tk.NW, text=label, fill="#181712")

    def normalized_canvas_rect(self) -> tuple[int, int, int, int] | None:
        if self.drag_start is None or self.drag_current is None:
            return None

        start_x, start_y = self.clamp_to_preview(*self.drag_start)
        current_x, current_y = self.clamp_to_preview(*self.drag_current)
        return (
            min(start_x, current_x),
            min(start_y, current_y),
            max(start_x, current_x),
            max(start_y, current_y),
        )

    def selection_image_rect(self) -> tuple[int, int, int, int] | None:
        canvas_rect = self.normalized_canvas_rect()
        if canvas_rect is None:
            return None

        x1, y1, x2, y2 = canvas_rect
        offset_x, offset_y = self.preview_offset
        image_x = int((x1 - offset_x) / self.preview_scale)
        image_y = int((y1 - offset_y) / self.preview_scale)
        image_width = int((x2 - x1) / self.preview_scale)
        image_height = int((y2 - y1) / self.preview_scale)

        image_x = max(0, min(image_x, self.image.width - 1))
        image_y = max(0, min(image_y, self.image.height - 1))
        image_width = max(0, min(image_width, self.image.width - image_x))
        image_height = max(0, min(image_height, self.image.height - image_y))
        return image_x, image_y, image_width, image_height

    def clamp_to_preview(self, x: int, y: int) -> tuple[int, int]:
        offset_x, offset_y = self.preview_offset
        preview_width, preview_height = self.preview_size
        return (
            max(offset_x, min(x, offset_x + preview_width)),
            max(offset_y, min(y, offset_y + preview_height)),
        )

    def on_press(self, event) -> None:
        if self.capture_problem:
            return
        self.drag_start = self.clamp_to_preview(event.x, event.y)
        self.drag_current = self.drag_start
        self.status.set("Keep dragging to cover the text. Release to scan.")
        self.render()

    def on_drag(self, event) -> None:
        if self.drag_start is None:
            return
        self.drag_current = self.clamp_to_preview(event.x, event.y)
        self.render()

    def on_release(self, event) -> None:
        if self.drag_start is None:
            return
        self.drag_current = self.clamp_to_preview(event.x, event.y)
        image_rect = self.selection_image_rect()
        if image_rect is None:
            self.reset_small_selection()
            return

        image_x, image_y, width, height = image_rect
        if width < self.MIN_SELECTION_SIZE or height < self.MIN_SELECTION_SIZE:
            self.reset_small_selection()
            return

        left = int(self.monitor["left"] + image_x)
        top = int(self.monitor["top"] + image_y)
        self.status.set("Scanning selected region...")
        self.window.withdraw()
        self.window.update_idletasks()
        self.window.after(
            120,
            lambda: self.finish({"left": left, "top": top, "width": width, "height": height}),
        )

    def reset_small_selection(self) -> None:
        self.drag_start = None
        self.drag_current = None
        self.status.set("That box was too small. Drag a larger box around the Japanese text.")
        self.render()

    def cancel(self, _event=None) -> None:
        self.finish(None)

    def finish(self, rect: dict[str, int] | None) -> None:
        if self.finished:
            return
        self.finished = True
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
