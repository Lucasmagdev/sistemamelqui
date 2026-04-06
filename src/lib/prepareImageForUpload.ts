import { readFileAsDataUrl } from "@/lib/fileToDataUrl";

const MAX_IMAGE_DIMENSION = 1600;
const RAW_FILE_SIZE_LIMIT = 1_800_000;
const TARGET_DATA_URL_BYTES = 2_400_000;
const JPEG_QUALITIES = [0.88, 0.82, 0.76, 0.68];

type PreparedImageUpload = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

const replaceExtension = (fileName: string, nextExtension: string) => {
  const normalized = String(fileName || "imagem.jpg").trim() || "imagem.jpg";
  return normalized.replace(/\.[a-z0-9]+$/i, "") + nextExtension;
};

const estimateDataUrlBytes = (dataUrl: string) => {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Falha ao carregar imagem selecionada."));
    };
    image.src = objectUrl;
  });

export async function prepareImageForUpload(file: File): Promise<PreparedImageUpload> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") {
    return {
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    };
  }

  const image = await loadImageElement(file);
  const originalWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const originalHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const largestDimension = Math.max(originalWidth, originalHeight);
  const needsResize = largestDimension > MAX_IMAGE_DIMENSION;
  const isAlreadyLightweight = file.size <= RAW_FILE_SIZE_LIMIT && !needsResize;

  if (isAlreadyLightweight) {
    return {
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    };
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / largestDimension);
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return {
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    };
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let bestDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITIES[0]);
  for (const quality of JPEG_QUALITIES) {
    const attempt = canvas.toDataURL("image/jpeg", quality);
    bestDataUrl = attempt;
    if (estimateDataUrlBytes(attempt) <= TARGET_DATA_URL_BYTES) {
      break;
    }
  }

  return {
    dataUrl: bestDataUrl,
    fileName: replaceExtension(file.name || "produto.jpg", ".jpg"),
    mimeType: "image/jpeg",
  };
}
