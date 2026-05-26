"use client";

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export function ExportActions({ targetId }: { targetId: string }) {
  async function exportPng() {
    const node = document.getElementById(targetId);
    if (!node) return;
    const canvas = await html2canvas(node, { backgroundColor: "#f7f4ed", scale: 2 });
    const url = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dashboard.png";
    anchor.click();
  }

  async function exportPdf() {
    const node = document.getElementById(targetId);
    if (!node) return;
    const canvas = await html2canvas(node, { backgroundColor: "#f7f4ed", scale: 2 });
    const image = canvas.toDataURL("image/png");
    const pdf = new jsPDF("landscape", "px", [canvas.width, canvas.height]);
    pdf.addImage(image, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save("dashboard.pdf");
  }

  return (
    <div className="flex gap-3">
      <button className="rounded-xl border border-line bg-white px-4 py-2 text-sm" onClick={exportPng} type="button">
        Export PNG
      </button>
      <button className="rounded-xl bg-accent px-4 py-2 text-sm text-white" onClick={exportPdf} type="button">
        Export PDF
      </button>
    </div>
  );
}
