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
from PIL import Image
from pynput import keyboard
import mss


CONFIG_PATH = Path.home() / ".yomunami-overlay.json"
DEFAULT_API_URL = os.environ.get("YOMUNAMI_API_URL", "http://127.0.0.1:3001")
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

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Term":
        return cls(
            term_type=str(payload.get("termType") or payload.get("term_type") or "unknown"),
            text=str(payload.get("text") or ""),
            reading=payload.get("reading"),
            meaning=payload.get("meaning"),
            source=str(payload.get("source") or "ocr"),
            source_image_id=payload.get("sourceImageId") or payload.get("source_image_id"),
        )

    def to_api(self) -> dict[str, Any]:
        return {
            "termType": self.term_type,
            "text": self.text,
            "reading": self.reading,
            "meaning": self.meaning,
            "source": self.source,
            "sourceImageId": self.source_image_id,
            "frequency": 1,
        }


class OverlayApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Yomunami OCR Overlay")
        self.root.geometry("760x620")
        self.root.minsize(640, 520)

        self.config = self.load_config()
        self.api_url = tk.StringVar(value=self.config.get("api_url", DEFAULT_API_URL))
        self.hotkey = tk.StringVar(value=self.config.get("hotkey", DEFAULT_HOTKEY))
        self.status = tk.StringVar(value="Ready")
        self.resource_label = tk.StringVar(value="No resource selected")

        self.resources: list[Resource] = []
        self.selected_resource_id: int | None = self.config.get("resource_id")
        self.last_terms: list[Term] = []
        self.term_vars: list[tk.BooleanVar] = []
        self.hotkey_listener: keyboard.GlobalHotKeys | None = None

        self.build_ui()
        self.refresh_resources()
        self.start_hotkey_listener()

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
                    "hotkey": self.hotkey.get(),
                    "resource_id": self.selected_resource_id,
                },
                indent=2,
            )
        )

    def build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=18)
        outer.pack(fill=tk.BOTH, expand=True)

        title = ttk.Frame(outer)
        title.pack(fill=tk.X, pady=(0, 14))
        ttk.Label(title, text="Yomunami OCR Overlay", font=("TkDefaultFont", 18, "bold")).pack(side=tk.LEFT)
        ttk.Button(title, text="Open Web App", command=lambda: webbrowser.open("http://127.0.0.1:5173")).pack(side=tk.RIGHT)

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

        ttk.Label(self.root, textvariable=self.status, relief=tk.SUNKEN, anchor=tk.W).pack(side=tk.BOTTOM, fill=tk.X)

    def apply_settings(self) -> None:
        self.save_config()
        self.start_hotkey_listener()
        self.status.set(f"Hotkey set to {self.hotkey.get()}")

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
        try:
            response = requests.get(f"{self.api_url.get().rstrip('/')}/api/resources?limit=200", timeout=10)
            response.raise_for_status()
            self.resources = [
                Resource(id=int(item["id"]), name=str(item["name"]), type=str(item["type"]))
                for item in response.json().get("items", [])
            ]
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
        except Exception as exc:
            self.status.set(f"Could not load resources: {exc}")

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
            self.submit_ocr(image)
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror("Capture failed", str(exc))
            self.status.set(f"Capture failed: {exc}")

    def capture_rect(self, rect: dict[str, int]) -> Image.Image:
        with mss.mss() as screen:
            grabbed = screen.grab(rect)
            return Image.frombytes("RGB", grabbed.size, grabbed.rgb)

    def submit_ocr(self, image: Image.Image) -> None:
        self.status.set("Running OCR...")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        files = {"image": ("capture.png", buffer, "image/png")}
        api_url = self.api_url.get().rstrip("/")

        response = requests.post(f"{api_url}/api/ocr/image", files=files, timeout=120)
        response.raise_for_status()
        payload = response.json()
        ocr = payload.get("ocr", payload)
        terms = ocr.get("terms", [])
        self.last_terms = [Term.from_payload(term) for term in terms if term.get("text")]
        self.render_result(str(ocr.get("rawText") or ocr.get("raw_text") or ""), self.last_terms)
        self.status.set(f"OCR complete: {len(self.last_terms)} term candidates")

    def render_result(self, raw_text: str, terms: list[Term]) -> None:
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

        response = requests.post(
            f"{self.api_url.get().rstrip('/')}/api/resources/{self.selected_resource_id}/terms/bulk",
            json={"terms": selected},
            timeout=20,
        )
        response.raise_for_status()
        self.status.set(f"Added {len(selected)} terms to tracker")

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
