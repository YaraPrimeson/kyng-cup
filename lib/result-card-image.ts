import { cardHeights, renderResultCard, type CardContent, type CardFormat } from "./result-card-svg";

async function photoData(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "omit", mode: "cors", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Photo unavailable");
  const blob = await response.blob();
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 5_000_000) throw new Error("Unsupported photo");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Photo unavailable"));
    reader.readAsDataURL(blob);
  });
}

export async function createResultCardFile(content: CardContent, format: CardFormat, fileName: string, photoUrl?: string) {
  let photoOmitted = false, photoDataUrl: string | undefined;
  if (photoUrl) { try { photoDataUrl = await photoData(photoUrl); } catch { photoOmitted = true; } }
  const svgUrl = URL.createObjectURL(new Blob([renderResultCard({ ...content, photoDataUrl }, format)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Card rendering timed out")), 10000);
      image.onload = () => { window.clearTimeout(timeout); resolve(); };
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error("Card rendering failed")); };
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = cardHeights[format];
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Card export failed");
    return { file: new File([blob], fileName, { type: "image/png" }), photoOmitted };
  } finally { URL.revokeObjectURL(svgUrl); }
}
